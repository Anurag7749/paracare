"""
Blink event history service — server-side filtered queries with summary stats.
"""
from datetime import datetime
from sqlalchemy import func
from app.extensions import db
from app.models import BlinkEvent, Patient, Device, Alert, CommandEnum
from app.errors.exceptions import ValidationError


def get_blink_history(patient_id=None, command=None, source=None,
                      start_date=None, end_date=None, page=1, per_page=50,
                      patient_ids=None):
    """Query blink events with filters and pagination.
    patient_ids: optional list to restrict results (CAREGIVER scoping).
    None means no restriction (ADMIN); empty list means no access."""
    if patient_ids is not None and len(patient_ids) == 0:
        return {
            "items": [],
            "pagination": {"page": page, "per_page": per_page, "total": 0, "pages": 0}
        }

    query = BlinkEvent.query

    if patient_id:
        query = query.filter_by(patient_id=patient_id)
    if patient_ids is not None:
        query = query.filter(BlinkEvent.patient_id.in_(patient_ids))
    if command:
        query = query.filter_by(command=command.upper())
    if source:
        query = query.filter_by(source=source.upper())
    if start_date:
        try:
            query = query.filter(BlinkEvent.timestamp >= datetime.fromisoformat(start_date))
        except ValueError:
            raise ValidationError(f"Invalid start_date: {start_date}")
    if end_date:
        try:
            query = query.filter(BlinkEvent.timestamp <= datetime.fromisoformat(end_date))
        except ValueError:
            raise ValidationError(f"Invalid end_date: {end_date}")

    query = query.order_by(BlinkEvent.timestamp.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    items = []
    for b in pagination.items:
        item = b.to_dict()
        patient = Patient.query.get(b.patient_id)
        if patient:
            item['patient_name'] = patient.name
            item['patient_code'] = patient.patient_code
        device = Device.query.get(b.device_id)
        if device:
            item['device_name'] = device.device_id
        # Check if alert exists for this blink event
        alert = Alert.query.filter_by(blink_event_id=b.id).first()
        item['alert_status'] = alert.status if alert else None
        item['alert_id'] = str(alert.id) if alert else None
        items.append(item)

    return {
        "items": items,
        "pagination": {
            "page": pagination.page, "per_page": pagination.per_page,
            "total": pagination.total, "pages": pagination.pages
        }
    }


def get_blink_summary(patient_id=None, start_date=None, end_date=None, patient_ids=None):
    """Get command distribution summary counts.
    patient_ids: optional list to restrict results (CAREGIVER scoping)."""
    empty_summary = {
        "total": 0,
        "commands": {cmd.value: 0 for cmd in CommandEnum},
        "sources": {"CAMERA": 0, "ESP32": 0, "SIMULATOR": 0},
        "distribution": []
    }
    if patient_ids is not None and len(patient_ids) == 0:
        return empty_summary

    query = BlinkEvent.query
    if patient_id:
        query = query.filter_by(patient_id=patient_id)
    if patient_ids is not None:
        query = query.filter(BlinkEvent.patient_id.in_(patient_ids))
    if start_date:
        query = query.filter(BlinkEvent.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(BlinkEvent.timestamp <= datetime.fromisoformat(end_date))

    total = query.count()
    summary = {}
    for cmd in CommandEnum:
        count = query.filter_by(command=cmd.value).count()
        summary[cmd.value] = count

    # Source breakdown
    camera_count = query.filter_by(source="CAMERA").count()
    esp32_count = query.filter_by(source="ESP32").count()
    iot_glasses_count = query.filter_by(source="IOT_GLASSES").count()
    simulator_count = query.filter_by(source="SIMULATOR").count()

    return {
        "total": total,
        "commands": summary,
        "sources": {"CAMERA": camera_count, "ESP32": esp32_count, "IOT_GLASSES": iot_glasses_count, "SIMULATOR": simulator_count},
        "distribution": [
            {"command": cmd.value, "count": summary[cmd.value]}
            for cmd in CommandEnum if summary[cmd.value] > 0
        ]
    }
