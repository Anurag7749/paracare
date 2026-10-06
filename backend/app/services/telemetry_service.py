"""
Telemetry history service — server-side filtered, paginated health reading queries.
"""
import csv
import io
from datetime import datetime
from sqlalchemy import func
from app.extensions import db
from app.models import HealthReading, Patient
from app.errors.exceptions import ValidationError


def get_telemetry_history(patient_id=None, start_date=None, end_date=None,
                          metric=None, page=1, per_page=50, patient_ids=None):
    """
    Query health readings with filters and pagination.
    patient_ids: optional list to restrict results (CAREGIVER scoping).
    Returns items list and pagination metadata.
    """
    if patient_ids is not None and len(patient_ids) == 0:
        return {
            "items": [],
            "pagination": {"page": page, "per_page": per_page, "total": 0, "pages": 0}
        }

    query = HealthReading.query

    if patient_id:
        query = query.filter_by(patient_id=patient_id)
    if patient_ids is not None:
        query = query.filter(HealthReading.patient_id.in_(patient_ids))
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            query = query.filter(HealthReading.timestamp >= start_dt)
        except ValueError:
            raise ValidationError(f"Invalid start_date format: {start_date}")
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
            query = query.filter(HealthReading.timestamp <= end_dt)
        except ValueError:
            raise ValidationError(f"Invalid end_date format: {end_date}")

    query = query.order_by(HealthReading.timestamp.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    items = []
    for r in pagination.items:
        item = r.to_dict()
        patient = Patient.query.get(r.patient_id)
        if patient:
            item['patient_name'] = patient.name
            item['patient_code'] = patient.patient_code
        items.append(item)

    return {
        "items": items,
        "pagination": {
            "page": pagination.page, "per_page": pagination.per_page,
            "total": pagination.total, "pages": pagination.pages
        }
    }


def get_telemetry_stats(patient_id, start_date=None, end_date=None):
    """
    Get min/max/avg/latest stats for heart_rate, spo2, temperature.
    """
    query = HealthReading.query.filter_by(patient_id=patient_id)

    if start_date:
        query = query.filter(HealthReading.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(HealthReading.timestamp <= datetime.fromisoformat(end_date))

    stats = db.session.query(
        func.min(HealthReading.heart_rate).label('hr_min'),
        func.max(HealthReading.heart_rate).label('hr_max'),
        func.avg(HealthReading.heart_rate).label('hr_avg'),
        func.min(HealthReading.spo2).label('spo2_min'),
        func.max(HealthReading.spo2).label('spo2_max'),
        func.avg(HealthReading.spo2).label('spo2_avg'),
        func.min(HealthReading.temperature).label('temp_min'),
        func.max(HealthReading.temperature).label('temp_max'),
        func.avg(HealthReading.temperature).label('temp_avg'),
        func.count(HealthReading.id).label('total_readings')
    ).filter(HealthReading.patient_id == patient_id)

    if start_date:
        stats = stats.filter(HealthReading.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        stats = stats.filter(HealthReading.timestamp <= datetime.fromisoformat(end_date))

    row = stats.first()

    latest = HealthReading.query.filter_by(patient_id=patient_id)\
        .order_by(HealthReading.timestamp.desc()).first()

    return {
        "heart_rate": {
            "min": round(row.hr_min, 1) if row.hr_min else None,
            "max": round(row.hr_max, 1) if row.hr_max else None,
            "avg": round(row.hr_avg, 1) if row.hr_avg else None,
            "latest": latest.heart_rate if latest else None
        },
        "spo2": {
            "min": round(row.spo2_min, 1) if row.spo2_min else None,
            "max": round(row.spo2_max, 1) if row.spo2_max else None,
            "avg": round(row.spo2_avg, 1) if row.spo2_avg else None,
            "latest": latest.spo2 if latest else None
        },
        "temperature": {
            "min": round(row.temp_min, 1) if row.temp_min else None,
            "max": round(row.temp_max, 1) if row.temp_max else None,
            "avg": round(row.temp_avg, 1) if row.temp_avg else None,
            "latest": latest.temperature if latest else None
        },
        "total_readings": row.total_readings or 0,
        "latest_timestamp": latest.timestamp.isoformat() if latest else None
    }


def get_telemetry_chart_data(patient_id, start_date=None, end_date=None, limit=100):
    """Get time-series data for charting."""
    query = HealthReading.query.filter_by(patient_id=patient_id)
    if start_date:
        query = query.filter(HealthReading.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(HealthReading.timestamp <= datetime.fromisoformat(end_date))
    readings = query.order_by(HealthReading.timestamp.asc()).limit(limit).all()
    return [{
        "timestamp": r.timestamp.isoformat(),
        "heart_rate": r.heart_rate,
        "spo2": r.spo2,
        "temperature": r.temperature
    } for r in readings]


def export_telemetry_csv(patient_id, start_date=None, end_date=None):
    """Export health readings as CSV string."""
    query = HealthReading.query.filter_by(patient_id=patient_id)
    if start_date:
        query = query.filter(HealthReading.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(HealthReading.timestamp <= datetime.fromisoformat(end_date))
    readings = query.order_by(HealthReading.timestamp.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Timestamp', 'Heart Rate', 'SpO2', 'Temperature', 'Battery %', 'WiFi Status'])
    for r in readings:
        writer.writerow([
            r.timestamp.isoformat() if r.timestamp else '',
            r.heart_rate, r.spo2, r.temperature,
            r.battery_percentage, r.wifi_status
        ])
    return output.getvalue()
