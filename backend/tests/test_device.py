import json
import pytest
from app.extensions import db
from app.models import (
    User, Patient, Device, HealthReading, BlinkEvent, Alert, CommandEnum
)
from werkzeug.security import generate_password_hash


@pytest.fixture(autouse=True)
def setup_device_test_data(app):
    """Create test patient and device records for device API tests."""
    with app.app_context():
        db.drop_all()
        db.create_all()

        patient = Patient(
            patient_code="PATIENT-001",
            name="Test Patient",
            age=55,
            gender="Male",
            condition="ALS",
            room_number="ICU-101"
        )
        db.session.add(patient)
        db.session.commit()

        device = Device(
            device_id="PARACARE-001",
            patient_id=patient.id,
            device_name="Test Smart Glasses",
            battery_percentage=95.0,
            wifi_status="Connected"
        )
        db.session.add(device)
        db.session.commit()

        yield

        db.session.remove()
        db.drop_all()


class TestDeviceDataEndpoint:
    """Tests for POST /api/device/data"""

    def test_full_payload_need_water(self, client):
        """Test processing a NEED_WATER command with full vitals payload."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "timestamp": "2026-08-10T14:00:00Z",
            "blink_count": 2,
            "blink_duration": 1.4,
            "command": "NEED_WATER",
            "heart_rate": 78,
            "spo2": 98,
            "temperature": 36.7,
            "battery_percentage": 85,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert data["success"] is True
        assert data["data"]["command_processed"] == "NEED_WATER"
        assert data["data"]["health_reading_id"] is not None
        assert data["data"]["blink_event_id"] is not None
        assert data["data"]["alert_id"] is not None

    def test_full_payload_need_food(self, client):
        """Test processing a NEED_FOOD command."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "blink_count": 3,
            "blink_duration": 1.8,
            "command": "NEED_FOOD",
            "heart_rate": 72,
            "spo2": 97,
            "temperature": 36.5,
            "battery_percentage": 80,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert data["data"]["command_processed"] == "NEED_FOOD"
        assert data["data"]["alert_id"] is not None

    def test_full_payload_need_medicine(self, client):
        """Test processing a NEED_MEDICINE command."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "blink_count": 4,
            "blink_duration": 1.9,
            "command": "NEED_MEDICINE",
            "heart_rate": 85,
            "spo2": 96,
            "temperature": 37.2,
            "battery_percentage": 75,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert data["data"]["command_processed"] == "NEED_MEDICINE"

    def test_emergency_sos(self, client):
        """Test processing an EMERGENCY SOS command."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "blink_count": 1,
            "blink_duration": 3.5,
            "command": "EMERGENCY",
            "heart_rate": 110,
            "spo2": 92,
            "temperature": 38.1,
            "battery_percentage": 60,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert data["data"]["command_processed"] == "EMERGENCY"
        assert data["data"]["alert_id"] is not None

    def test_normal_blink_no_alert(self, client):
        """Test that NORMAL_BLINK stores health reading but no blink event or alert."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "blink_count": 1,
            "blink_duration": 0.2,
            "command": "NORMAL_BLINK",
            "heart_rate": 75,
            "spo2": 99,
            "temperature": 36.4,
            "battery_percentage": 90,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 201
        data = response.get_json()
        assert data["data"]["blink_event_id"] is None
        assert data["data"]["alert_id"] is None

    def test_unregistered_device_rejected(self, client):
        """Test that an unregistered device_id is rejected with 401."""
        payload = {
            "device_id": "UNKNOWN-DEVICE-999",
            "patient_id": "PATIENT-001",
            "command": "NEED_WATER",
            "heart_rate": 78,
            "spo2": 98,
            "temperature": 36.7,
            "battery_percentage": 85,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 401
        data = response.get_json()
        assert data["success"] is False

    def test_missing_device_id_rejected(self, client):
        """Test that a payload without device_id is rejected."""
        payload = {
            "patient_id": "PATIENT-001",
            "command": "NEED_WATER",
            "heart_rate": 78,
            "spo2": 98,
            "temperature": 36.7
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 401

    def test_unknown_patient_rejected(self, client):
        """Test that an unknown patient_id is rejected with 404."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "NONEXISTENT-PATIENT",
            "command": "NEED_WATER",
            "heart_rate": 78,
            "spo2": 98,
            "temperature": 36.7,
            "battery_percentage": 85,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 404

    def test_invalid_command_rejected(self, client):
        """Test that an invalid command is rejected with 400."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "command": "DANCE",
            "heart_rate": 78,
            "spo2": 98,
            "temperature": 36.7,
            "battery_percentage": 85,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/data', json=payload)
        assert response.status_code == 400

    def test_device_status_updated_after_data(self, client, app):
        """Test that device battery and last_seen are updated after /data."""
        payload = {
            "device_id": "PARACARE-001",
            "patient_id": "PATIENT-001",
            "command": "NORMAL_BLINK",
            "heart_rate": 78,
            "spo2": 98,
            "temperature": 36.7,
            "battery_percentage": 42,
            "wifi_status": "Weak Signal"
        }
        client.post('/api/device/data', json=payload)
        with app.app_context():
            device = Device.query.filter_by(device_id="PARACARE-001").first()
            assert device.battery_percentage == 42.0
            assert device.wifi_status == "Weak Signal"
            assert device.is_online is True
            assert device.last_seen is not None


class TestDeviceHeartbeatEndpoint:
    """Tests for POST /api/device/heartbeat"""

    def test_heartbeat_success(self, client):
        """Test that heartbeat returns ONLINE status."""
        payload = {
            "device_id": "PARACARE-001",
            "battery_percentage": 88,
            "wifi_status": "Strong"
        }
        response = client.post('/api/device/heartbeat', json=payload)
        assert response.status_code == 200
        data = response.get_json()
        assert data["success"] is True
        assert data["data"]["status"] == "ONLINE"
        assert data["data"]["battery_percentage"] == 88

    def test_heartbeat_unregistered_device(self, client):
        """Test heartbeat from unregistered device is rejected."""
        payload = {
            "device_id": "GHOST-DEVICE",
            "battery_percentage": 50,
            "wifi_status": "Connected"
        }
        response = client.post('/api/device/heartbeat', json=payload)
        assert response.status_code == 401
