import datetime
import secrets
from werkzeug.security import generate_password_hash
from app.extensions import db
from app.models import (
    User, Patient, Caregiver, CaregiverPatient, Device,
    HealthReading, BlinkEvent, Alert, NotificationLog, AuditLog,
    CommandEnum, SourceEnum, SeverityEnum
)

def generate_device_api_key():
    """Generate a new plaintext device API key (URL-safe, 32 bytes)."""
    return secrets.token_urlsafe(32)

def seed_database():
    """Seed initial development data for ParaCare system."""
    print("Seeding database...")
    
    # 1. Clear existing records if needed (order of deletion respects FK constraints)
    NotificationLog.query.delete()
    Alert.query.delete()
    BlinkEvent.query.delete()
    HealthReading.query.delete()
    Device.query.delete()
    CaregiverPatient.query.delete()
    Caregiver.query.delete()
    AuditLog.query.delete()
    User.query.delete()
    Patient.query.delete()
    db.session.commit()

    # 2. Create Users (Admin & Caregivers)
    admin_user = User(
        name="System Admin",
        email="admin@paracare.org",
        password_hash=generate_password_hash("AdminPass123!"),
        role="ADMIN"
    )
    caregiver_user1 = User(
        name="Sarah Jenkins",
        email="sarah.jenkins@paracare.org",
        password_hash=generate_password_hash("Caregiver123!"),
        role="CAREGIVER"
    )
    caregiver_user2 = User(
        name="David Miller",
        email="david.miller@paracare.org",
        password_hash=generate_password_hash("Caregiver123!"),
        role="CAREGIVER"
    )
    db.session.add_all([admin_user, caregiver_user1, caregiver_user2])
    db.session.commit()

    # 3. Create Caregiver Profiles
    cg1 = Caregiver(
        user_id=caregiver_user1.id,
        phone="+1234567890",
        whatsapp_number="+1234567890"
    )
    cg2 = Caregiver(
        user_id=caregiver_user2.id,
        phone="+1987654321",
        whatsapp_number="+1987654321"
    )
    db.session.add_all([cg1, cg2])
    db.session.commit()

    # 4. Create Patients
    patient1 = Patient(
        patient_code="PAT-1001",
        name="Robert Chen",
        age=68,
        gender="Male",
        condition="ALS (Amyotrophic Lateral Sclerosis) - Quadriplegia",
        room_number="ICU-402"
    )
    patient2 = Patient(
        patient_code="PAT-1002",
        name="Elena Rostova",
        age=54,
        gender="Female",
        condition="Severe Spinal Cord Injury (C3/C4)",
        room_number="ICU-405"
    )
    db.session.add_all([patient1, patient2])
    db.session.commit()

    # 5. Assign Patients to Caregivers
    cp1 = CaregiverPatient(caregiver_id=cg1.id, patient_id=patient1.id)
    cp2 = CaregiverPatient(caregiver_id=cg1.id, patient_id=patient2.id)
    cp3 = CaregiverPatient(caregiver_id=cg2.id, patient_id=patient2.id)
    db.session.add_all([cp1, cp2, cp3])
    db.session.commit()

    # 6. Register Wearable Devices (Smart Glasses)
    # Each device gets a randomly generated API key. The plaintext key is
    # only ever shown here at seed time - only its hash is stored in the
    # database. Copy these into firmware/simulator config (X-Device-Key
    # header) - they cannot be retrieved again after this script runs.
    device1_api_key = generate_device_api_key()
    device2_api_key = generate_device_api_key()

    device1 = Device(
        device_id="ESP32-PARACARE-001",
        patient_id=patient1.id,
        device_name="Smart Glasses Pro - unit 1",
        battery_percentage=92.5,
        wifi_status="CONNECTED (-62 dBm)",
        is_online=True,
        api_key_hash=generate_password_hash(device1_api_key)
    )
    device2 = Device(
        device_id="ESP32-PARACARE-002",
        patient_id=patient2.id,
        device_name="Smart Glasses Pro - unit 2",
        battery_percentage=85.0,
        wifi_status="CONNECTED (-68 dBm)",
        is_online=True,
        api_key_hash=generate_password_hash(device2_api_key)
    )
    db.session.add_all([device1, device2])
    db.session.commit()

    # 7. Add Health Readings
    hr1 = HealthReading(
        patient_id=patient1.id,
        device_id=device1.id,
        heart_rate=76.0,
        spo2=98.5,
        temperature=36.6,
        battery_percentage=92.5,
        wifi_status="-62 dBm"
    )
    hr2 = HealthReading(
        patient_id=patient2.id,
        device_id=device2.id,
        heart_rate=82.0,
        spo2=97.0,
        temperature=37.1,
        battery_percentage=85.0,
        wifi_status="-68 dBm"
    )
    db.session.add_all([hr1, hr2])
    db.session.commit()

    # 8. Add Blink Events
    blink1 = BlinkEvent(
        patient_id=patient1.id,
        device_id=device1.id,
        blink_count=2,
        duration_seconds=1.2,
        command=CommandEnum.NEED_WATER.value,
        severity=SeverityEnum.MEDIUM.value,
        source=SourceEnum.ESP32.value
    )
    blink2 = BlinkEvent(
        patient_id=patient1.id,
        device_id=device1.id,
        blink_count=1,
        duration_seconds=3.5,
        command=CommandEnum.EMERGENCY.value,
        severity=SeverityEnum.CRITICAL.value,
        source=SourceEnum.ESP32.value
    )
    db.session.add_all([blink1, blink2])
    db.session.commit()

    # 9. Add Alerts & Notification Logs
    alert1 = Alert(
        patient_id=patient1.id,
        blink_event_id=blink1.id,
        alert_type="BLINK_REQUEST",
        severity="MEDIUM",
        message="Patient Robert Chen requested: Need Water (2 blinks)",
        status="ACKNOWLEDGED",
        acknowledged_by=caregiver_user1.id
    )
    alert2 = Alert(
        patient_id=patient1.id,
        blink_event_id=blink2.id,
        alert_type="EMERGENCY_SOS",
        severity="CRITICAL",
        message="EMERGENCY SOS: Patient Robert Chen eye closure >= 3 seconds!",
        status="PENDING"
    )
    db.session.add_all([alert1, alert2])
    db.session.commit()

    notif1 = NotificationLog(
        alert_id=alert1.id,
        channel="WHATSAPP",
        recipient="+1234567890",
        message="Patient Robert Chen requested: Need Water (2 blinks)",
        status="DELIVERED"
    )
    notif2 = NotificationLog(
        alert_id=alert2.id,
        channel="SMS",
        recipient="+1234567890",
        message="CRITICAL EMERGENCY: Patient Robert Chen triggered SOS!",
        status="SENT"
    )
    db.session.add_all([notif1, notif2])

    # 10. Audit Log
    audit1 = AuditLog(
        user_id=caregiver_user1.id,
        action="ACKNOWLEDGE_ALERT",
        entity_type="Alert",
        entity_id=str(alert1.id),
        metadata_json={"notes": "Provided water to patient in room ICU-402"}
    )
    db.session.add(audit1)
    db.session.commit()

    print("Database seeding completed successfully!")
    print("")
    print("=" * 70)
    print("DEVICE API KEYS (shown once - configure these into firmware/simulator)")
    print("=" * 70)
    print(f"  ESP32-PARACARE-001  X-Device-Key: {device1_api_key}")
    print(f"  ESP32-PARACARE-002  X-Device-Key: {device2_api_key}")
    print("=" * 70)
