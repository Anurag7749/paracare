"""
ParaCare Reports Service — Generates patient reports from PostgreSQL data.
Uses actual stored data. Does NOT fabricate values. Does NOT make medical diagnoses.
"""
import csv
import io
from datetime import datetime, timezone
from sqlalchemy import func
from app.extensions import db
from app.models import Patient, Device, HealthReading, BlinkEvent, Alert, CommandEnum
from app.errors.exceptions import NotFoundError


def generate_patient_report(patient_id, start_date=None, end_date=None):
    """
    Generate a comprehensive patient report from stored data.
    
    Includes: patient info, monitoring period, vital stats, blink command counts,
    alert count, device info, chart data, and command distribution.
    """
    patient = Patient.query.get(patient_id)
    if not patient:
        raise NotFoundError(f"Patient not found: {patient_id}")

    # Build date filters
    health_q = HealthReading.query.filter_by(patient_id=patient_id)
    blink_q = BlinkEvent.query.filter_by(patient_id=patient_id)
    alert_q = Alert.query.filter_by(patient_id=patient_id)

    if start_date:
        sd = datetime.fromisoformat(start_date)
        health_q = health_q.filter(HealthReading.timestamp >= sd)
        blink_q = blink_q.filter(BlinkEvent.timestamp >= sd)
        alert_q = alert_q.filter(Alert.created_at >= sd)
    if end_date:
        ed = datetime.fromisoformat(end_date)
        health_q = health_q.filter(HealthReading.timestamp <= ed)
        blink_q = blink_q.filter(BlinkEvent.timestamp <= ed)
        alert_q = alert_q.filter(Alert.created_at <= ed)

    # Vital stats
    vital_stats = db.session.query(
        func.avg(HealthReading.heart_rate).label('avg_hr'),
        func.avg(HealthReading.spo2).label('avg_spo2'),
        func.avg(HealthReading.temperature).label('avg_temp'),
        func.min(HealthReading.heart_rate).label('min_hr'),
        func.max(HealthReading.heart_rate).label('max_hr'),
        func.min(HealthReading.spo2).label('min_spo2'),
        func.max(HealthReading.spo2).label('max_spo2'),
        func.min(HealthReading.temperature).label('min_temp'),
        func.max(HealthReading.temperature).label('max_temp'),
        func.count(HealthReading.id).label('total_readings')
    ).filter(HealthReading.patient_id == patient_id)
    if start_date:
        vital_stats = vital_stats.filter(HealthReading.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        vital_stats = vital_stats.filter(HealthReading.timestamp <= datetime.fromisoformat(end_date))
    vs = vital_stats.first()

    # Blink command counts
    command_counts = {}
    for cmd in CommandEnum:
        command_counts[cmd.value] = blink_q.filter_by(command=cmd.value).count()
    total_commands = blink_q.count()

    # Alert count
    alert_count = alert_q.count()
    pending_alerts = alert_q.filter_by(status="PENDING").count()

    # Device info
    devices = Device.query.filter_by(patient_id=patient_id).all()
    device_info = []
    for d in devices:
        device_info.append({
            "device_id": d.device_id,
            "device_name": d.device_name,
            "battery_percentage": d.battery_percentage,
            "wifi_status": d.wifi_status,
            "is_online": d.is_online,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None
        })

    # Health trend chart data (last 50 readings)
    chart_readings = HealthReading.query.filter_by(patient_id=patient_id)\
        .order_by(HealthReading.timestamp.asc()).limit(50).all()
    health_trend = [{
        "timestamp": r.timestamp.isoformat(),
        "heart_rate": r.heart_rate,
        "spo2": r.spo2,
        "temperature": r.temperature
    } for r in chart_readings]

    # Command distribution for chart
    command_distribution = [
        {"command": cmd, "count": count}
        for cmd, count in command_counts.items() if count > 0
    ]

    # Source breakdown
    camera_count = blink_q.filter_by(source="CAMERA").count()
    esp32_count = blink_q.filter_by(source="ESP32").count()
    iot_glasses_count = blink_q.filter_by(source="IOT_GLASSES").count()
    simulator_count = blink_q.filter_by(source="SIMULATOR").count()

    # Recent communication requests for report table
    recent_events = blink_q.order_by(BlinkEvent.timestamp.desc()).limit(20).all()
    recent_requests = []
    for ev in recent_events:
        alert = Alert.query.filter_by(blink_event_id=ev.id).first()
        recent_requests.append({
            "id": str(ev.id),
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            "command": ev.command,
            "blink_count": ev.blink_count,
            "duration_seconds": ev.duration_seconds,
            "source": ev.source,
            "severity": ev.severity,
            "alert_status": alert.status if alert else ('NORMAL' if ev.command == 'NORMAL_BLINK' else 'SENT')
        })

    need_water = command_counts.get(CommandEnum.NEED_WATER.value, 0)
    need_food = command_counts.get(CommandEnum.NEED_FOOD.value, 0)
    need_medicine = command_counts.get(CommandEnum.NEED_MEDICINE.value, 0)
    emergency = command_counts.get(CommandEnum.EMERGENCY.value, 0)
    total_actionable_requests = need_water + need_food + need_medicine + emergency

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "monitoring_period": {
            "start": start_date or "All time",
            "end": end_date or "Present"
        },
        "patient": patient.to_dict(),
        "vital_statistics": {
            "average_heart_rate": round(vs.avg_hr, 1) if vs.avg_hr else None,
            "average_spo2": round(vs.avg_spo2, 1) if vs.avg_spo2 else None,
            "average_temperature": round(vs.avg_temp, 1) if vs.avg_temp else None,
            "min_heart_rate": round(vs.min_hr, 1) if vs.min_hr else None,
            "max_heart_rate": round(vs.max_hr, 1) if vs.max_hr else None,
            "min_spo2": round(vs.min_spo2, 1) if vs.min_spo2 else None,
            "max_spo2": round(vs.max_spo2, 1) if vs.max_spo2 else None,
            "min_temperature": round(vs.min_temp, 1) if vs.min_temp else None,
            "max_temperature": round(vs.max_temp, 1) if vs.max_temp else None,
            "total_readings": vs.total_readings or 0
        },
        "blink_commands": {
            "total": total_commands,
            "total_requests": total_actionable_requests,
            "need_water": need_water,
            "need_food": need_food,
            "need_medicine": need_medicine,
            "emergency": emergency,
            "normal_blink": command_counts.get(CommandEnum.NORMAL_BLINK.value, 0)
        },
        "data_sources": {"CAMERA": camera_count, "ESP32": esp32_count, "IOT_GLASSES": iot_glasses_count, "SIMULATOR": simulator_count},
        "alerts": {"total": alert_count, "pending": pending_alerts},
        "devices": device_info,
        "health_trend": health_trend,
        "command_distribution": command_distribution,
        "recent_requests": recent_requests
    }


def export_report_csv(patient_id, start_date=None, end_date=None):
    """Export patient report summary as CSV."""
    report = generate_patient_report(patient_id, start_date, end_date)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(['ParaCare Patient Report'])
    writer.writerow(['Generated', report['generated_at']])
    writer.writerow(['Period', report['monitoring_period']['start'], 'to', report['monitoring_period']['end']])
    writer.writerow([])

    p = report['patient']
    writer.writerow(['Patient Information'])
    writer.writerow(['Name', p.get('name')])
    writer.writerow(['Code', p.get('patient_code')])
    writer.writerow(['Age', p.get('age')])
    writer.writerow(['Room', p.get('room_number')])
    writer.writerow(['Condition', p.get('condition')])
    writer.writerow([])

    vs = report['vital_statistics']
    writer.writerow(['Vital Statistics', 'Avg', 'Min', 'Max'])
    writer.writerow(['Heart Rate', vs.get('average_heart_rate'), vs.get('min_heart_rate'), vs.get('max_heart_rate')])
    writer.writerow(['SpO2', vs.get('average_spo2'), vs.get('min_spo2'), vs.get('max_spo2')])
    writer.writerow(['Temperature', vs.get('average_temperature'), vs.get('min_temperature'), vs.get('max_temperature')])
    writer.writerow(['Total Readings', vs.get('total_readings')])
    writer.writerow([])

    bc = report['blink_commands']
    writer.writerow(['Blink Communication Requests'])
    writer.writerow(['Total Actionable Requests', bc.get('total_requests')])
    writer.writerow(['Need Water', bc.get('need_water')])
    writer.writerow(['Need Food', bc.get('need_food')])
    writer.writerow(['Need Medicine', bc.get('need_medicine')])
    writer.writerow(['Emergency SOS', bc.get('emergency')])
    writer.writerow(['Total Blink Events (including normal)', bc.get('total')])
    writer.writerow([])

    ds = report['data_sources']
    writer.writerow(['Data Sources', 'CAMERA', ds.get('CAMERA', 0), 'ESP32', ds.get('ESP32', 0), 'IOT_GLASSES', ds.get('IOT_GLASSES', 0), 'SIMULATOR', ds.get('SIMULATOR', 0)])
    writer.writerow([])

    writer.writerow(['Alerts'])
    writer.writerow(['Total', report['alerts']['total']])
    writer.writerow(['Pending', report['alerts']['pending']])
    writer.writerow([])

    writer.writerow(['Recent Patient Requests'])
    writer.writerow(['Timestamp', 'Command', 'Blink Count', 'Duration (s)', 'Source', 'Severity', 'Status'])
    for req in report.get('recent_requests', []):
        writer.writerow([
            req.get('timestamp'),
            req.get('command'),
            req.get('blink_count'),
            req.get('duration_seconds'),
            req.get('source'),
            req.get('severity'),
            req.get('alert_status')
        ])

    return output.getvalue()
