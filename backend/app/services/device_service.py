from datetime import datetime, timezone
from dateutil import parser as dateutil_parser
from flask import current_app
from werkzeug.security import check_password_hash
from app.extensions import db, socketio
from app.models import (
    Device, Patient, HealthReading, BlinkEvent, Alert,
    CommandEnum, SeverityEnum, SourceEnum
)
from app.services.audit_service import log_audit
from app.services.blink_service import normalize_blink_data
from app.services.alert_service import create_alert_from_blink
from app.errors.exceptions import ValidationError, NotFoundError, UnauthorizedError

# Valid commands accepted from ESP32 / Simulator
VALID_COMMANDS = {c.value for c in CommandEnum}

# Map command -> severity
COMMAND_SEVERITY_MAP = {
    CommandEnum.NORMAL_BLINK.value: SeverityEnum.LOW.value,
    CommandEnum.NEED_WATER.value: SeverityEnum.MEDIUM.value,
    CommandEnum.NEED_FOOD.value: SeverityEnum.MEDIUM.value,
    CommandEnum.NEED_MEDICINE.value: SeverityEnum.HIGH.value,
    CommandEnum.EMERGENCY.value: SeverityEnum.CRITICAL.value,
}

# Map command -> human-readable label for alert messages
COMMAND_LABELS = {
    CommandEnum.NEED_WATER.value: "Need Water",
    CommandEnum.NEED_FOOD.value: "Need Food",
    CommandEnum.NEED_MEDICINE.value: "Need Medicine",
    CommandEnum.EMERGENCY.value: "EMERGENCY SOS",
}


def authenticate_device(device_id, api_key=None):
    """
    Authenticate an ESP32 device by its registered device_id AND a secret
    device API key (sent via the 'X-Device-Key' header), NOT by device_id
    alone.

    Behavior is controlled by the DEVICE_AUTH_REQUIRED config flag:
      - True (recommended / production): every device MUST have an
        api_key_hash configured, and the caller MUST send a matching
        X-Device-Key header. Missing/invalid key -> UnauthorizedError.
      - False (local development convenience only): if a device has no
        api_key_hash configured yet, the key check is skipped so the
        project can be exercised before device credentials are
        provisioned. This must never be enabled in production.

    Returns the Device ORM object or raises UnauthorizedError.
    """
    if not device_id:
        raise UnauthorizedError("Missing device_id in payload")

    device = Device.query.filter_by(device_id=device_id).first()
    if not device:
        raise UnauthorizedError(f"Unregistered device: {device_id}")

    auth_required = current_app.config.get('DEVICE_AUTH_REQUIRED', True)

    if device.api_key_hash:
        if not api_key or not check_password_hash(device.api_key_hash, api_key):
            raise UnauthorizedError(f"Invalid or missing device credentials for: {device_id}")
    elif auth_required:
        raise UnauthorizedError(
            f"Device '{device_id}' has no API key configured. "
            f"Provision device credentials before sending data."
        )
    # else: DEVICE_AUTH_REQUIRED=false and no key configured yet -> allowed
    # only in local development.

    return device


def validate_device_patient_relationship(device, patient_code):
    """
    Validate that the device is assigned to the patient identified by patient_code.
    Returns the Patient ORM object or raises ValidationError.
    """
    if not patient_code:
        raise ValidationError("Missing patient_id in payload")

    patient = Patient.query.filter_by(patient_code=patient_code).first()
    if not patient:
        raise NotFoundError(f"Patient not found: {patient_code}")

    if device.patient_id and device.patient_id != patient.id:
        raise ValidationError(
            f"Device '{device.device_id}' is not assigned to patient '{patient_code}'"
        )

    # Auto-assign device to patient if not yet assigned
    if not device.patient_id:
        device.patient_id = patient.id
        db.session.commit()

    return patient


def validate_payload(data):
    """
    Validate the incoming ESP32 data payload for required fields and types.
    """
    errors = []
    if not data.get('device_id'):
        errors.append("device_id is required")
    if not data.get('patient_id'):
        errors.append("patient_id is required")
    if data.get('command') and data['command'] not in VALID_COMMANDS:
        errors.append(f"Invalid command: {data['command']}. Valid: {sorted(VALID_COMMANDS)}")
    if errors:
        raise ValidationError("Payload validation failed", details=errors)


def _parse_timestamp(ts_string):
    """Parse an ISO timestamp string, or return current UTC time."""
    if ts_string:
        try:
            return dateutil_parser.parse(ts_string)
        except (ValueError, TypeError):
            pass
    return datetime.now(timezone.utc)


def store_health_reading(device, patient, data, timestamp):
    """
    Persist a health telemetry reading to the database.
    """
    reading = HealthReading(
        patient_id=patient.id,
        device_id=device.id,
        timestamp=timestamp,
        heart_rate=float(data.get('heart_rate', 0)),
        spo2=float(data.get('spo2', 0)),
        temperature=float(data.get('temperature', 0)),
        battery_percentage=float(data.get('battery_percentage', 0)),
        wifi_status=data.get('wifi_status', '')
    )
    db.session.add(reading)
    db.session.commit()
    return reading


def store_blink_event(device, patient, data, timestamp):
    """
    Persist a blink event to the database.
    Returns the BlinkEvent ORM object, or None if the command is NORMAL_BLINK.
    """
    command = data.get('command', CommandEnum.NORMAL_BLINK.value)

    # Skip storage for normal single blinks
    if command == CommandEnum.NORMAL_BLINK.value:
        return None

    severity = COMMAND_SEVERITY_MAP.get(command, SeverityEnum.LOW.value)
    source = data.get('source', SourceEnum.ESP32.value)
    if source not in {s.value for s in SourceEnum}:
        source = SourceEnum.ESP32.value

    blink = BlinkEvent(
        patient_id=patient.id,
        device_id=device.id,
        timestamp=timestamp,
        blink_count=int(data.get('blink_count', 1)),
        duration_seconds=float(data.get('blink_duration', 0)),
        command=command,
        severity=severity,
        source=source
    )
    db.session.add(blink)
    db.session.commit()
    return blink


def update_device_status(device, data):
    """
    Update the device record with latest battery, Wi-Fi status, and last_seen.
    """
    device.battery_percentage = float(data.get('battery_percentage', device.battery_percentage))
    device.wifi_status = data.get('wifi_status', device.wifi_status)
    device.last_seen = datetime.now(timezone.utc)
    device.is_online = True
    db.session.commit()


def broadcast_telemetry(patient, reading):
    """
    Broadcast health telemetry update via Socket.IO to the patient's room.
    """
    room = f"patient_{patient.id}"
    socketio.emit('telemetry_update', reading.to_dict(), room=room)
    socketio.emit('telemetry_update', reading.to_dict(), room='admin')


def broadcast_device_status(device):
    """
    Broadcast device status update via Socket.IO.
    """
    room = f"patient_{device.patient_id}" if device.patient_id else None
    payload = {
        'device_id': device.device_id,
        'status': 'ONLINE' if device.is_online else 'OFFLINE',
        'battery': device.battery_percentage,
        'wifi_status': device.wifi_status,
        'last_seen': device.last_seen.isoformat() if device.last_seen else None
    }
    if room:
        socketio.emit('device_status', payload, room=room)
    socketio.emit('device_status', payload, room='admin')


def process_device_data(data, api_key=None):
    """
    Full ESP32 device data processing pipeline:
    1. Authenticate device (device_id + secret API key)
    2. Validate payload
    3. Validate device-patient relationship
    4. Validate command
    5. Store health reading
    6. Store blink event (if actionable)
    7. Update device status
    8. Trigger alert (if actionable)
    9. Broadcast WebSocket events
    10. Return response data
    """
    # 1. Authenticate device
    device = authenticate_device(data.get('device_id'), api_key=api_key)

    # 2. Validate payload
    validate_payload(data)

    # 3. Validate device/patient relationship
    patient = validate_device_patient_relationship(device, data.get('patient_id'))

    # 4. Validate and normalize blink command via blink_service FSM rules
    data = normalize_blink_data(data)
    command = data['command']

    # Parse timestamp
    timestamp = _parse_timestamp(data.get('timestamp'))

    # 5. Store health reading
    reading = store_health_reading(device, patient, data, timestamp)

    # 6. Store blink event
    blink_event = store_blink_event(device, patient, data, timestamp)

    # 7. Update device status
    update_device_status(device, data)

    # 8. Trigger alert engine (creates alert, broadcasts WS, dispatches notifications)
    alert = create_alert_from_blink(patient, blink_event, command)

    # 9. Broadcast telemetry and device status via WebSocket
    broadcast_telemetry(patient, reading)
    broadcast_device_status(device)

    # 10. Build response
    result = {
        "device_id": device.device_id,
        "patient_code": patient.patient_code,
        "health_reading_id": str(reading.id),
        "blink_event_id": str(blink_event.id) if blink_event else None,
        "alert_id": str(alert.id) if alert else None,
        "command_processed": command,
        "blink_validation": data.get('_blink_validation'),
        "timestamp": timestamp.isoformat()
    }

    return result


def process_device_heartbeat(data, api_key=None):
    """
    Lightweight ESP32 heartbeat — updates device online status and battery.
    No health reading or blink event is stored.
    """
    device = authenticate_device(data.get('device_id'), api_key=api_key)
    update_device_status(device, data)
    broadcast_device_status(device)

    return {
        "device_id": device.device_id,
        "status": "ONLINE",
        "battery_percentage": device.battery_percentage,
        "last_seen": device.last_seen.isoformat() if device.last_seen else None
    }
