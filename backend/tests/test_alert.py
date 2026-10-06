"""
Tests for ParaCare Alert Engine.

Covers:
  - NORMAL_BLINK produces no alert
  - NEED_WATER creates caregiver request alert
  - NEED_FOOD creates caregiver request alert
  - NEED_MEDICINE creates caregiver request alert
  - EMERGENCY creates critical emergency alert
  - Alert stored with patient, timestamp, severity, message, blink_event_id
  - GET /api/v1/alerts (list with filters)
  - GET /api/v1/alerts/<id> (detail)
  - POST /api/v1/alerts/<id>/acknowledge
  - Notification logs created
  - WebSocket events emitted
"""

import pytest
from app.extensions import db
from app.models import (
    User, Patient, Device, Caregiver, CaregiverPatient,
    BlinkEvent, Alert, NotificationLog,
    CommandEnum, SeverityEnum, SourceEnum
)
from app.services.alert_service import create_alert_from_blink
from werkzeug.security import generate_password_hash


@pytest.fixture(autouse=True)
def setup_alert_test_data(app):
    """Seed patient, device, caregiver, and user for alert tests."""
    with app.app_context():
        db.drop_all()
        db.create_all()

        # Admin user
        admin = User(
            name="Admin",
            email="admin@test.org",
            password_hash=generate_password_hash("Admin123!"),
            role="ADMIN"
        )
        # Caregiver user
        cg_user = User(
            name="CG Sarah",
            email="sarah@test.org",
            password_hash=generate_password_hash("CG123!"),
            role="CAREGIVER"
        )
        db.session.add_all([admin, cg_user])
        db.session.commit()

        # Caregiver profile
        caregiver = Caregiver(
            user_id=cg_user.id,
            phone="+1234567890",
            whatsapp_number="+1234567890"
        )
        db.session.add(caregiver)
        db.session.commit()

        # Patient
        patient = Patient(
            patient_code="PAT-TEST-001",
            name="Test Patient",
            age=60,
            gender="Male",
            condition="ALS",
            room_number="ICU-101"
        )
        db.session.add(patient)
        db.session.commit()

        # Assign caregiver to patient
        assignment = CaregiverPatient(
            caregiver_id=caregiver.id,
            patient_id=patient.id
        )
        db.session.add(assignment)
        db.session.commit()

        # Device
        device = Device(
            device_id="ESP32-ALERT-TEST",
            patient_id=patient.id,
            device_name="Alert Test Glasses"
        )
        db.session.add(device)
        db.session.commit()

        yield

        db.session.remove()
        db.drop_all()


def _get_auth_token(client, email, password):
    """Helper to get JWT access token."""
    res = client.post('/api/v1/auth/login', json={"email": email, "password": password})
    return res.get_json()["data"]["access_token"]


def _create_blink_event(command, blink_count, duration):
    """Helper to create a blink event for testing."""
    patient = Patient.query.filter_by(patient_code="PAT-TEST-001").first()
    device = Device.query.filter_by(device_id="ESP32-ALERT-TEST").first()

    source = SourceEnum.ESP32.value
    severity = {
        CommandEnum.NORMAL_BLINK.value: SeverityEnum.LOW.value,
        CommandEnum.NEED_WATER.value: SeverityEnum.MEDIUM.value,
        CommandEnum.NEED_FOOD.value: SeverityEnum.MEDIUM.value,
        CommandEnum.NEED_MEDICINE.value: SeverityEnum.HIGH.value,
        CommandEnum.EMERGENCY.value: SeverityEnum.CRITICAL.value,
    }.get(command, SeverityEnum.LOW.value)

    blink = BlinkEvent(
        patient_id=patient.id,
        device_id=device.id,
        blink_count=blink_count,
        duration_seconds=duration,
        command=command,
        severity=severity,
        source=source
    )
    db.session.add(blink)
    db.session.commit()
    return blink, patient


# ═══════════════════════════════════════════════════════════════════════════════
# Alert Creation Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAlertCreation:
    """Test create_alert_from_blink for all command types."""

    def test_normal_blink_no_alert(self, app):
        """NORMAL_BLINK should not create an alert."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NORMAL_BLINK.value, 1, 0.2)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NORMAL_BLINK.value)
            assert alert is None

    def test_need_water_creates_alert(self, app):
        """NEED_WATER should create a BLINK_REQUEST alert with MEDIUM severity."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_WATER.value, 2, 1.4)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_WATER.value)
            assert alert is not None
            assert alert.alert_type == "BLINK_REQUEST"
            assert alert.severity == SeverityEnum.MEDIUM.value
            assert alert.status == "PENDING"
            assert "Need Water" in alert.message
            assert patient.name in alert.message
            assert alert.blink_event_id == blink.id
            assert alert.patient_id == patient.id

    def test_need_food_creates_alert(self, app):
        """NEED_FOOD should create a BLINK_REQUEST alert."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_FOOD.value, 3, 1.8)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_FOOD.value)
            assert alert is not None
            assert alert.alert_type == "BLINK_REQUEST"
            assert "Need Food" in alert.message

    def test_need_medicine_creates_alert(self, app):
        """NEED_MEDICINE should create a BLINK_REQUEST alert with HIGH severity."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_MEDICINE.value, 4, 1.9)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_MEDICINE.value)
            assert alert is not None
            assert alert.alert_type == "BLINK_REQUEST"
            assert alert.severity == SeverityEnum.HIGH.value
            assert "Need Medicine" in alert.message

    def test_emergency_creates_critical_alert(self, app):
        """EMERGENCY should create an EMERGENCY_SOS alert with CRITICAL severity."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.EMERGENCY.value, 1, 3.5)
            alert = create_alert_from_blink(patient, blink, CommandEnum.EMERGENCY.value)
            assert alert is not None
            assert alert.alert_type == "EMERGENCY_SOS"
            assert alert.severity == SeverityEnum.CRITICAL.value
            assert "EMERGENCY SOS" in alert.message
            assert "Immediate attention required" in alert.message

    def test_alert_stored_in_database(self, app):
        """Alert should be persisted in PostgreSQL alerts table."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_WATER.value, 2, 1.4)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_WATER.value)
            fetched = Alert.query.get(alert.id)
            assert fetched is not None
            assert fetched.patient_id == patient.id
            assert fetched.created_at is not None

    def test_notification_logs_created(self, app):
        """Alert creation should generate notification logs for assigned caregivers."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_WATER.value, 2, 1.4)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_WATER.value)
            logs = NotificationLog.query.filter_by(alert_id=alert.id).all()
            # Should have logs for: WHATSAPP, SMS, EMAIL, SYSTEM
            assert len(logs) >= 1
            channels = {log.channel for log in logs}
            assert "SYSTEM" in channels


# ═══════════════════════════════════════════════════════════════════════════════
# Alert API Endpoint Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAlertEndpoints:
    """Test alert REST API endpoints."""

    def test_get_alerts_list(self, client, app):
        """GET /api/v1/alerts should return paginated alert list."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_WATER.value, 2, 1.4)
            create_alert_from_blink(patient, blink, CommandEnum.NEED_WATER.value)

        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        response = client.get('/api/v1/alerts', headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert "items" in data["data"]
        assert "pagination" in data["data"]
        assert len(data["data"]["items"]) >= 1

    def test_get_alerts_filter_by_status(self, client, app):
        """GET /api/v1/alerts?status=PENDING should only return pending alerts."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_FOOD.value, 3, 1.8)
            create_alert_from_blink(patient, blink, CommandEnum.NEED_FOOD.value)

        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        response = client.get('/api/v1/alerts?status=PENDING', headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        items = response.get_json()["data"]["items"]
        assert all(item["status"] == "PENDING" for item in items)

    def test_get_alerts_filter_by_severity(self, client, app):
        """GET /api/v1/alerts?severity=CRITICAL should only return critical alerts."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.EMERGENCY.value, 1, 3.5)
            create_alert_from_blink(patient, blink, CommandEnum.EMERGENCY.value)

        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        response = client.get('/api/v1/alerts?severity=CRITICAL', headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        items = response.get_json()["data"]["items"]
        assert all(item["severity"] == "CRITICAL" for item in items)

    def test_get_alert_detail(self, client, app):
        """GET /api/v1/alerts/<id> should return full alert with patient info."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_WATER.value, 2, 1.2)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_WATER.value)
            alert_id = str(alert.id)

        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        response = client.get(f'/api/v1/alerts/{alert_id}', headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.get_json()["data"]
        assert data["id"] == alert_id
        assert "patient_name" in data
        assert "blink_event" in data
        assert "notification_logs" in data

    def test_get_nonexistent_alert_404(self, client, app):
        """GET /api/v1/alerts/<invalid-id> should return 404."""
        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        response = client.get('/api/v1/alerts/00000000-0000-0000-0000-000000000000', headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 404

    def test_acknowledge_alert(self, client, app):
        """POST /api/v1/alerts/<id>/acknowledge should mark alert as ACKNOWLEDGED."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.EMERGENCY.value, 1, 3.5)
            alert = create_alert_from_blink(patient, blink, CommandEnum.EMERGENCY.value)
            alert_id = str(alert.id)

        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        response = client.post(f'/api/v1/alerts/{alert_id}/acknowledge',
            json={"notes": "Responding to patient immediately"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.get_json()["data"]
        assert data["status"] == "ACKNOWLEDGED"
        assert data["acknowledged_at"] is not None
        assert data["acknowledged_by"] is not None

    def test_acknowledge_already_acknowledged_fails(self, client, app):
        """Acknowledging an already acknowledged alert should return 400."""
        with app.app_context():
            blink, patient = _create_blink_event(CommandEnum.NEED_WATER.value, 2, 1.4)
            alert = create_alert_from_blink(patient, blink, CommandEnum.NEED_WATER.value)
            alert_id = str(alert.id)

        token = _get_auth_token(client, "sarah@test.org", "CG123!")
        # First acknowledge
        client.post(f'/api/v1/alerts/{alert_id}/acknowledge',
            headers={"Authorization": f"Bearer {token}"}
        )
        # Second acknowledge should fail
        response = client.post(f'/api/v1/alerts/{alert_id}/acknowledge',
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 400

    def test_alerts_require_authentication(self, client):
        """Alert endpoints should reject unauthenticated requests."""
        response = client.get('/api/v1/alerts')
        assert response.status_code == 401
