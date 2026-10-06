"""
ParaCare Blink Command Validation & Classification Service

Classification Rules (7-Second Window):
  1 blink                          = NORMAL_BLINK  (ignored / no alert)
  2 blinks within 7 seconds        = NEED_WATER    (caregiver request)
  3 blinks within 7 seconds        = NEED_FOOD     (caregiver request)
  4 blinks within 7 seconds        = NEED_MEDICINE (caregiver request)
  5 or more blinks                 = EMERGENCY     (critical SOS alert)
  continuous eye closure >= 3 sec   = EMERGENCY     (critical SOS alert)
"""

from app.models.blink_event import CommandEnum, SeverityEnum

# ─── FSM Constants ────────────────────────────────────────────────────────────

BLINK_WINDOW_SECONDS = 7.0       # Standard communication window (7 seconds)
SOS_HOLD_SECONDS = 3.0           # Minimum eye-closure duration for EMERGENCY
MAX_COMMAND_BLINKS = 4           # Blinks 1-4 map to standard commands; 5+ is EMERGENCY
MAX_BLINK_COUNT = MAX_COMMAND_BLINKS


# Blink count -> Command mapping
BLINK_COUNT_COMMAND_MAP = {
    1: CommandEnum.NORMAL_BLINK.value,
    2: CommandEnum.NEED_WATER.value,
    3: CommandEnum.NEED_FOOD.value,
    4: CommandEnum.NEED_MEDICINE.value,
}

# Command -> Severity mapping
COMMAND_SEVERITY_MAP = {
    CommandEnum.NORMAL_BLINK.value: SeverityEnum.LOW.value,
    CommandEnum.NEED_WATER.value: SeverityEnum.MEDIUM.value,
    CommandEnum.NEED_FOOD.value: SeverityEnum.MEDIUM.value,
    CommandEnum.NEED_MEDICINE.value: SeverityEnum.HIGH.value,
    CommandEnum.EMERGENCY.value: SeverityEnum.CRITICAL.value,
}

# Set of all valid commands
VALID_COMMANDS = {c.value for c in CommandEnum}


# ─── Classification ──────────────────────────────────────────────────────────

def classify_blink(blink_count, duration_seconds):
    """
    Classify a blink pattern into a ParaCare command using mandatory rules:
      1 blink  -> NORMAL_BLINK
      2 blinks -> NEED_WATER
      3 blinks -> NEED_FOOD
      4 blinks -> NEED_MEDICINE
      5+ blinks -> EMERGENCY
      closure >= 3s -> EMERGENCY

    Args:
        blink_count (int): Number of blinks detected in the window.
        duration_seconds (float): Duration of the blink sequence or eye closure.

    Returns:
        dict: {
            "command": str,       # The classified command
            "severity": str,      # Associated severity level
            "is_actionable": bool, # Whether the command should trigger an alert
            "description": str    # Human-readable description
        }
    """
    blink_count = int(blink_count) if blink_count is not None else 0
    duration_seconds = float(duration_seconds) if duration_seconds is not None else 0.0

    # Rule: Continuous eye closure >= 3 seconds = EMERGENCY SOS
    if (blink_count <= 1) and duration_seconds >= SOS_HOLD_SECONDS:
        return _build_result(
            command=CommandEnum.EMERGENCY.value,
            description=f"EMERGENCY SOS — continuous eye closure {duration_seconds:.1f}s (>= {SOS_HOLD_SECONDS}s)"
        )


    # Rule: 5+ blinks = EMERGENCY SOS (Mandatory rule: 5+ blinks MUST NOT be classified as Normal)
    if blink_count >= 5:
        return _build_result(
            command=CommandEnum.EMERGENCY.value,
            description=f"EMERGENCY SOS — {blink_count} blinks detected in {duration_seconds:.1f}s (>= 5 blinks)"
        )

    # Rule: blinks outside the 7-second window (for 2-4 blinks) = NORMAL_BLINK
    if 1 < blink_count <= MAX_COMMAND_BLINKS and duration_seconds > BLINK_WINDOW_SECONDS:
        return _build_result(
            command=CommandEnum.NORMAL_BLINK.value,
            description=f"Ignored — {blink_count} blinks over {duration_seconds:.1f}s exceeds {BLINK_WINDOW_SECONDS}s window"
        )

    # Rule: Map blink count to command (1-4, or 0)
    command = BLINK_COUNT_COMMAND_MAP.get(blink_count, CommandEnum.NORMAL_BLINK.value)
    descriptions = {
        CommandEnum.NORMAL_BLINK.value: "Normal blink — no action" if blink_count == 1 else "No blink activity",
        CommandEnum.NEED_WATER.value: f"Need Water — {blink_count} blinks within {duration_seconds:.1f}s",
        CommandEnum.NEED_FOOD.value: f"Need Food — {blink_count} blinks within {duration_seconds:.1f}s",
        CommandEnum.NEED_MEDICINE.value: f"Need Medicine — {blink_count} blinks within {duration_seconds:.1f}s",
    }

    return _build_result(
        command=command,
        description=descriptions.get(command, "Normal blink pattern")
    )



def _build_result(command, description):
    """Build a standardized classification result dict."""
    severity = COMMAND_SEVERITY_MAP.get(command, SeverityEnum.LOW.value)
    is_actionable = command != CommandEnum.NORMAL_BLINK.value

    return {
        "command": command,
        "severity": severity,
        "is_actionable": is_actionable,
        "description": description,
    }


# ─── Validation ──────────────────────────────────────────────────────────────

def validate_blink_command(command, blink_count, duration_seconds):
    """
    Validate an ESP32-reported command against the FSM rules.

    The ESP32 performs edge classification and sends its determined command.
    This function cross-checks the received command against what the backend
    would classify given the same blink_count and duration_seconds.

    Args:
        command (str): The command string reported by the ESP32.
        blink_count (int): Number of blinks reported by the ESP32.
        duration_seconds (float): Duration reported by the ESP32.

    Returns:
        dict: {
            "is_valid": bool,          # Whether the command is a recognized value
            "is_consistent": bool,     # Whether the command matches backend FSM rules
            "received_command": str,   # The command as received from ESP32
            "expected_command": str,   # The command the backend would classify
            "normalized_command": str, # The command to actually use (ESP32 command if valid, else expected)
            "severity": str,           # Severity of the normalized command
            "is_actionable": bool,     # Whether this command requires alert processing
        }
    """
    command = (command or '').strip().upper()
    blink_count = int(blink_count) if blink_count else 0
    duration_seconds = float(duration_seconds) if duration_seconds else 0.0

    is_valid = command in VALID_COMMANDS

    # Backend cross-check classification
    expected = classify_blink(blink_count, duration_seconds)
    expected_command = expected["command"]

    is_consistent = is_valid and (command == expected_command)

    # Normalization strategy:
    #   - If ESP32 command is valid, trust it (edge has the real sensor data).
    #   - If ESP32 command is invalid, fall back to backend classification.
    if is_valid:
        normalized_command = command
    else:
        normalized_command = expected_command

    severity = COMMAND_SEVERITY_MAP.get(normalized_command, SeverityEnum.LOW.value)
    is_actionable = normalized_command != CommandEnum.NORMAL_BLINK.value

    return {
        "is_valid": is_valid,
        "is_consistent": is_consistent,
        "received_command": command if command else "NONE",
        "expected_command": expected_command,
        "normalized_command": normalized_command,
        "severity": severity,
        "is_actionable": is_actionable,
    }


def normalize_blink_data(data):
    """
    Normalize and enrich a raw blink payload from ESP32 or simulator.

    This is called by the device_service pipeline before storing a blink event.
    It validates the ESP32-reported command and attaches the correct severity.

    Args:
        data (dict): Raw payload with keys: command, blink_count, blink_duration

    Returns:
        dict: Enriched copy of data with normalized command, severity, and validation metadata.
    """
    command = data.get('command', '')
    blink_count = data.get('blink_count', 1)
    duration = data.get('blink_duration', data.get('duration_seconds', 0))

    validation = validate_blink_command(command, blink_count, duration)

    enriched = dict(data)
    enriched['command'] = validation['normalized_command']
    enriched['severity'] = validation['severity']
    enriched['_blink_validation'] = validation

    return enriched


def process_blink_event(data, current_user=None):
    """
    Authoritative processing for blink events detected via Browser Camera, ESP32, or Simulator.
    Enforces the mandatory 7-second rule:
      1 blink  -> NORMAL_BLINK
      2 blinks -> NEED_WATER
      3 blinks -> NEED_FOOD
      4 blinks -> NEED_MEDICINE
      5+ blinks -> EMERGENCY
      closure >= 3s -> EMERGENCY

    Flow: Camera Detection -> Backend Authoritative Classification -> DB -> Alert -> Socket.IO -> Dashboard
    """
    from datetime import datetime, timezone
    from app.extensions import db, socketio
    from app.models import Patient, Device, BlinkEvent, SourceEnum
    from app.errors.exceptions import NotFoundError
    from app.services.alert_service import create_alert_from_blink

    # 1. Deduplication / Idempotency check
    event_id = data.get('event_id')
    from app.models import BlinkEvent, Alert, Patient, Device, SourceEnum
    from app.extensions import db, socketio
    from app.errors.exceptions import NotFoundError

    if event_id:
        try:
            existing = BlinkEvent.query.get(event_id)
            if existing:
                existing_alert = Alert.query.filter_by(blink_event_id=existing.id).first()
                return {
                    'id': str(existing.id),
                    'patient_id': str(existing.patient_id),
                    'patient_code': existing.patient.patient_code if existing.patient else '',
                    'patient_name': existing.patient.name if existing.patient else '',
                    'device_id': str(existing.device_id),
                    'command_processed': existing.command,
                    'severity': existing.severity,
                    'blink_count': existing.blink_count,
                    'duration_seconds': existing.duration_seconds,
                    'source': existing.source,
                    'alert_id': str(existing_alert.id) if existing_alert else None,
                    'is_actionable': existing.command != CommandEnum.NORMAL_BLINK.value,
                    'description': f"Previously processed: {existing.command}",
                    'timestamp': existing.timestamp.isoformat() if existing.timestamp else ''
                }
        except Exception:
            pass

    blink_count = data.get('blink_count', 1)
    duration_seconds = data.get('duration_seconds', data.get('blink_duration', 0.0))
    source = data.get('source', SourceEnum.CAMERA.value)
    if source not in {s.value for s in SourceEnum}:
        source = SourceEnum.CAMERA.value

    # 2. Authoritative Backend Classification (never trust frontend blindly)
    classification = classify_blink(blink_count, duration_seconds)
    command = classification['command']
    severity = classification['severity']

    # 3. Resolve patient with Caregiver authorization
    patient_id = data.get('patient_id')
    patient = None
    if patient_id:
        patient = Patient.query.get(patient_id)
        if not patient:
            patient = Patient.query.filter_by(patient_code=str(patient_id)).first()

    if not patient and current_user and current_user.role == 'CAREGIVER' and current_user.caregiver_profile:
        from app.models import CaregiverPatient
        assignment = CaregiverPatient.query.filter_by(caregiver_id=current_user.caregiver_profile.id).first()
        if assignment:
            patient = Patient.query.get(assignment.patient_id)

    if not patient:
        patient = Patient.query.first()

    if not patient:
        raise NotFoundError("No registered patient found in the system")

    # Enforce authorization if caregiver is submitting
    if current_user and current_user.role == 'CAREGIVER':
        from app.utils.decorators import check_patient_access
        if patient_id:
            # Explicit patient_id passed -> Must strictly enforce authorization (raises ForbiddenError on mismatch)
            check_patient_access(current_user, patient.id)
        else:
            try:
                check_patient_access(current_user, patient.id)
            except Exception:
                if current_user.caregiver_profile:
                    from app.models import CaregiverPatient
                    assignment = CaregiverPatient.query.filter_by(caregiver_id=current_user.caregiver_profile.id).first()
                    if assignment:
                        patient = Patient.query.get(assignment.patient_id)
                    else:
                        new_assignment = CaregiverPatient(caregiver_id=current_user.caregiver_profile.id, patient_id=patient.id)
                        db.session.add(new_assignment)
                        db.session.commit()


    # 4. Resolve device
    device_id = data.get('device_id')
    device = None
    if device_id:
        device = Device.query.filter_by(device_id=str(device_id)).first()
        if not device:
            device = Device.query.get(device_id)

    if not device:
        device = Device.query.filter_by(patient_id=patient.id).first()
        if not device:
            device = Device.query.first()

    if not device:
        device = Device(
            device_id="CAMERA-WEB-001",
            device_name="Browser Camera Detection",
            patient_id=patient.id,
            is_online=True,
            battery_percentage=100.0,
            wifi_status="WEB_CONNECTED"
        )
        db.session.add(device)
        db.session.commit()

    # 5. Store BlinkEvent in database
    from datetime import datetime, timezone
    import uuid
    now = datetime.now(timezone.utc)
    
    event_kwargs = {
        'patient_id': patient.id,
        'device_id': device.id,
        'timestamp': now,
        'blink_count': int(blink_count) if blink_count is not None else 1,
        'duration_seconds': float(duration_seconds) if duration_seconds is not None else 0.0,
        'command': command,
        'severity': severity,
        'source': source
    }
    if event_id:
        try:
            uuid.UUID(str(event_id))
            event_kwargs['id'] = event_id
        except ValueError:
            pass

    blink_event = BlinkEvent(**event_kwargs)
    db.session.add(blink_event)
    db.session.commit()

    # 6. Process alert if actionable
    from app.services.alert_service import create_alert_from_blink
    alert = None
    if classification['is_actionable']:
        alert = create_alert_from_blink(patient, blink_event, command)
    else:
        # Broadcast normal single blink to update caregiver monitoring feeds
        room = f"patient_{patient.id}"
        blink_payload = {
            'patient_id': str(patient.id),
            'patient_name': patient.name,
            'command': command,
            'severity': severity,
            'blink_count': blink_event.blink_count,
            'duration_seconds': blink_event.duration_seconds,
            'source': source,
            'timestamp': now.isoformat()
        }
        socketio.emit('blink_command', blink_payload, room=room)
        socketio.emit('blink_command', blink_payload, room='admin')
        socketio.emit('blink_command', blink_payload)

    return {
        'id': str(blink_event.id),
        'patient_id': str(patient.id),
        'patient_code': patient.patient_code,
        'patient_name': patient.name,
        'device_id': str(device.id),
        'command_processed': command,
        'severity': severity,
        'blink_count': blink_event.blink_count,
        'duration_seconds': blink_event.duration_seconds,
        'source': source,
        'alert_id': str(alert.id) if alert else None,
        'is_actionable': classification['is_actionable'],
        'description': classification['description'],
        'timestamp': now.isoformat()
    }


