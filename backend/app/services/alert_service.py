"""
ParaCare Alert Engine

Responsibilities:
  - Create alerts from blink events (NEED_WATER, NEED_FOOD, NEED_MEDICINE, EMERGENCY)
  - Skip alerts for NORMAL_BLINK
  - Store alerts in PostgreSQL with patient, timestamp, severity, message
  - Associate alerts with their originating blink event
  - Broadcast alerts via WebSocket to patient rooms
  - Dispatch notifications to assigned caregivers
  - Query alerts with filtering and pagination
  - Acknowledge alerts with caregiver identity and audit trail

Does NOT make medical diagnoses.
"""

from datetime import datetime, timezone
from flask import current_app
from app.extensions import db, socketio
from app.models import (
    Alert, Patient, BlinkEvent, User, Caregiver, CaregiverPatient,
    CommandEnum, SeverityEnum
)
from app.services.notification_service import dispatch_notifications
from app.services.audit_service import log_audit
from app.errors.exceptions import NotFoundError, ValidationError, ForbiddenError

# ─── Command → Alert Configuration ───────────────────────────────────────────

COMMAND_SEVERITY_MAP = {
    CommandEnum.NORMAL_BLINK.value: SeverityEnum.LOW.value,
    CommandEnum.NEED_WATER.value: SeverityEnum.MEDIUM.value,
    CommandEnum.NEED_FOOD.value: SeverityEnum.MEDIUM.value,
    CommandEnum.NEED_MEDICINE.value: SeverityEnum.HIGH.value,
    CommandEnum.EMERGENCY.value: SeverityEnum.CRITICAL.value,
}

COMMAND_ALERT_TYPE_MAP = {
    CommandEnum.NEED_WATER.value: "BLINK_REQUEST",
    CommandEnum.NEED_FOOD.value: "BLINK_REQUEST",
    CommandEnum.NEED_MEDICINE.value: "BLINK_REQUEST",
    CommandEnum.EMERGENCY.value: "EMERGENCY_SOS",
}

COMMAND_LABELS = {
    CommandEnum.NEED_WATER.value: "Need Water",
    CommandEnum.NEED_FOOD.value: "Need Food",
    CommandEnum.NEED_MEDICINE.value: "Need Medicine",
    CommandEnum.EMERGENCY.value: "EMERGENCY SOS",
}


# ─── Alert Creation ──────────────────────────────────────────────────────────

def create_alert_from_blink(patient, blink_event, command):
    """
    Create an alert from a blink event and dispatch notifications.

    Rules:
      - NORMAL_BLINK → No alert (returns None)
      - NEED_WATER / NEED_FOOD / NEED_MEDICINE → Caregiver request alert
      - EMERGENCY → Critical emergency alert

    Args:
        patient: Patient ORM object.
        blink_event: BlinkEvent ORM object (or None).
        command: str command value from CommandEnum.

    Returns:
        Alert ORM object, or None for NORMAL_BLINK.
    """
    # Normal blinks do not generate alerts
    if command == CommandEnum.NORMAL_BLINK.value:
        return None

    label = COMMAND_LABELS.get(command, command)
    severity = COMMAND_SEVERITY_MAP.get(command, SeverityEnum.LOW.value)
    alert_type = COMMAND_ALERT_TYPE_MAP.get(command, "BLINK_REQUEST")

    # Build human-readable message (no medical diagnosis)
    if command == CommandEnum.EMERGENCY.value:
        message = (
            f"EMERGENCY SOS: Patient {patient.name} "
            f"(Room {patient.room_number or 'N/A'}) — "
            f"Emergency blink gesture detected! Immediate attention required."
        )
    else:
        message = (
            f"Patient {patient.name} "
            f"(Room {patient.room_number or 'N/A'}) "
            f"requested: {label}"
        )

    # 1. Store alert in PostgreSQL / DB
    alert = Alert(
        patient_id=patient.id,
        blink_event_id=blink_event.id if blink_event else None,
        alert_type=alert_type,
        severity=severity,
        message=message,
        status="PENDING"
    )
    db.session.add(alert)
    db.session.commit()

    # 2. Broadcast via WebSocket
    _broadcast_alert(patient, alert, command, blink_event)

    # 3. Dispatch notifications to assigned caregivers
    _dispatch_to_caregivers(patient, alert)

    return alert


def _broadcast_alert(patient, alert, command, blink_event=None):
    """Broadcast alert event to the patient's Socket.IO room and broadcast."""
    room = f"patient_{patient.id}"
    payload = alert.to_dict()
    payload['patient_name'] = patient.name
    payload['room_number'] = patient.room_number
    payload['command'] = command
    if blink_event:
        payload['blink_count'] = blink_event.blink_count
        payload['duration_seconds'] = blink_event.duration_seconds
        payload['source'] = blink_event.source

    if command == CommandEnum.EMERGENCY.value:
        socketio.emit('emergency_sos', payload, room=room)
        socketio.emit('emergency_sos', payload, room='admin')
        socketio.emit('emergency_sos', payload)
    else:
        socketio.emit('alert_triggered', payload, room=room)
        socketio.emit('alert_triggered', payload, room='admin')
        socketio.emit('alert_triggered', payload)

    # Also emit blink_command event for real-time dashboard updates
    blink_payload = {
        'patient_id': str(patient.id),
        'patient_name': patient.name,
        'command': command,
        'severity': alert.severity,
        'blink_count': blink_event.blink_count if blink_event else 1,
        'duration_seconds': blink_event.duration_seconds if blink_event else 0.0,
        'source': blink_event.source if blink_event else 'CAMERA',
        'timestamp': alert.created_at.isoformat() if alert.created_at else None,
        'alert_id': str(alert.id),
        'alert_status': alert.status
    }
    socketio.emit('blink_command', blink_payload, room=room)
    socketio.emit('blink_command', blink_payload, room='admin')
    socketio.emit('blink_command', blink_payload)




def _dispatch_to_caregivers(patient, alert):
    """Find assigned caregivers and dispatch notifications."""
    try:
        # Get caregivers assigned to this patient via junction table
        assignments = CaregiverPatient.query.filter_by(patient_id=patient.id).all()
        caregiver_ids = [a.caregiver_id for a in assignments]

        if not caregiver_ids:
            print(f"[ALERT ENGINE] No caregivers assigned to patient {patient.patient_code}")
            return

        caregivers = Caregiver.query.filter(Caregiver.id.in_(caregiver_ids)).all()
        dispatch_notifications(alert, caregivers)

    except Exception as e:
        print(f"[ALERT ENGINE] Notification dispatch error: {str(e)}")


# ─── Alert Queries ───────────────────────────────────────────────────────────

def get_alerts(patient_id=None, status=None, severity=None, page=1, per_page=20, patient_ids=None):
    """
    Query alerts with optional filtering and pagination.

    Args:
        patient_id: UUID filter by patient (optional).
        status: str filter by status: PENDING, ACKNOWLEDGED, RESOLVED (optional).
        severity: str filter by severity: LOW, MEDIUM, HIGH, CRITICAL (optional).
        page: int page number (1-indexed).
        per_page: int items per page.
        patient_ids: optional list restricting results to these patient ids
            (used to scope CAREGIVER users to only their assigned patients).
            None means no restriction (ADMIN). Empty list means no access.

    Returns:
        dict with items list and pagination metadata.
    """
    if patient_ids is not None and len(patient_ids) == 0:
        return {
            "items": [],
            "pagination": {"page": page, "per_page": per_page, "total": 0, "pages": 0}
        }

    query = Alert.query

    if patient_id:
        query = query.filter_by(patient_id=patient_id)
    if patient_ids is not None:
        query = query.filter(Alert.patient_id.in_(patient_ids))
    if status:
        query = query.filter_by(status=status.upper())
    if severity:
        query = query.filter_by(severity=severity.upper())

    query = query.order_by(Alert.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    items = []
    for alert in pagination.items:
        alert_dict = alert.to_dict()
        # Enrich with patient info
        patient = Patient.query.get(alert.patient_id)
        if patient:
            alert_dict['patient_name'] = patient.name
            alert_dict['patient_code'] = patient.patient_code
            alert_dict['room_number'] = patient.room_number
        items.append(alert_dict)

    return {
        "items": items,
        "pagination": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages
        }
    }


def get_alert_by_id(alert_id):
    """
    Get a single alert by ID with enriched patient and blink event details.

    Returns:
        dict: Alert data with patient and blink event info.
    Raises:
        NotFoundError: If the alert does not exist.
    """
    alert = Alert.query.get(alert_id)
    if not alert:
        raise NotFoundError(f"Alert not found: {alert_id}")

    alert_dict = alert.to_dict()

    # Enrich with patient details
    patient = Patient.query.get(alert.patient_id)
    if patient:
        alert_dict['patient_name'] = patient.name
        alert_dict['patient_code'] = patient.patient_code
        alert_dict['room_number'] = patient.room_number

    # Enrich with blink event details
    if alert.blink_event_id:
        blink = BlinkEvent.query.get(alert.blink_event_id)
        if blink:
            alert_dict['blink_event'] = blink.to_dict()

    # Attach notification logs
    alert_dict['notification_logs'] = [n.to_dict() for n in alert.notification_logs.all()]

    return alert_dict


# ─── Alert Acknowledgment ───────────────────────────────────────────────────

def acknowledge_alert(alert_id, user_id, notes=None):
    """
    Acknowledge a pending alert.

    Args:
        alert_id: UUID of the alert.
        user_id: UUID of the acknowledging user (caregiver/admin).
        notes: Optional notes string.

    Returns:
        dict: Updated alert data.
    Raises:
        NotFoundError: If alert not found.
        ValidationError: If alert is already acknowledged/resolved.
    """
    alert = Alert.query.get(alert_id)
    if not alert:
        raise NotFoundError(f"Alert not found: {alert_id}")

    if alert.status in ("ACKNOWLEDGED", "RESOLVED"):
        raise ValidationError(
            f"Alert is already {alert.status.lower()}",
            details={"current_status": alert.status}
        )

    # Update alert status
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = user_id
    db.session.commit()

    # Audit log
    log_audit(
        user_id=user_id,
        action="ACKNOWLEDGE_ALERT",
        entity_type="Alert",
        entity_id=str(alert.id),
        metadata={"notes": notes, "severity": alert.severity, "alert_type": alert.alert_type}
    )

    # Broadcast acknowledgment via WebSocket
    room = f"patient_{alert.patient_id}"
    socketio.emit('alert_acknowledged', alert.to_dict(), room=room)
    socketio.emit('alert_acknowledged', alert.to_dict(), room='admin')

    return get_alert_by_id(alert_id)


def resolve_alert(alert_id, user_id, notes=None):
    """
    Resolve an acknowledged alert.

    Args:
        alert_id: UUID of the alert.
        user_id: UUID of the resolving user.
        notes: Optional notes string.

    Returns:
        dict: Updated alert data.
    """
    alert = Alert.query.get(alert_id)
    if not alert:
        raise NotFoundError(f"Alert not found: {alert_id}")

    if alert.status == "RESOLVED":
        raise ValidationError("Alert is already resolved")

    alert.status = "RESOLVED"
    if not alert.acknowledged_at:
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.acknowledged_by = user_id
    db.session.commit()

    log_audit(
        user_id=user_id,
        action="RESOLVE_ALERT",
        entity_type="Alert",
        entity_id=str(alert.id),
        metadata={"notes": notes}
    )

    room = f"patient_{alert.patient_id}"
    socketio.emit('alert_resolved', alert.to_dict(), room=room)
    socketio.emit('alert_resolved', alert.to_dict(), room='admin')

    return get_alert_by_id(alert_id)
