import pytest
from app.extensions import db
from app.models import User, Patient, Device, HealthReading, BlinkEvent, CommandEnum
from werkzeug.security import generate_password_hash

@pytest.fixture(autouse=True)
def setup_report_data(app):
    with app.app_context():
        # Reset first (not just at teardown) so a prior failed run that
        # aborted before reaching its own teardown can't leave stale rows
        # (e.g. a duplicate patient_code) that break this test on the next run.
        db.drop_all()
        db.create_all()
        user = User(name="Admin", email="rep_admin@test.org", password_hash=generate_password_hash("Admin123!"), role="ADMIN")
        patient = Patient(patient_code="PAT-REP-001", name="Report Patient", age=65, room_number="202")
        db.session.add_all([user, patient])
        db.session.commit()

        device = Device(device_id="ESP32-REP-001", patient_id=patient.id, device_name="Report Test Device")
        db.session.add(device)
        db.session.commit()

        # Add sample readings
        reading = HealthReading(patient_id=patient.id, device_id=device.id, heart_rate=80, spo2=98, temperature=36.6)
        blink = BlinkEvent(patient_id=patient.id, device_id=device.id, command=CommandEnum.NEED_WATER.value, blink_count=2, duration_seconds=1.4)
        db.session.add_all([reading, blink])
        db.session.commit()

        yield
        db.session.remove()
        db.drop_all()

def _get_token(client):
    res = client.post('/api/v1/auth/login', json={"email": "rep_admin@test.org", "password": "Admin123!"})
    return res.get_json()["data"]["access_token"]

class TestReportEndpoints:
    def test_get_patient_report(self, client, app):
        token = _get_token(client)
        with app.app_context():
            pid = str(Patient.query.filter_by(patient_code="PAT-REP-001").first().id)

        res = client.get(f'/api/v1/reports/patient/{pid}', headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.get_json()["data"]
        assert data["patient"]["name"] == "Report Patient"
        assert data["vital_statistics"]["average_heart_rate"] == 80.0
        assert data["blink_commands"]["need_water"] == 1

    def test_export_report_csv(self, client, app):
        token = _get_token(client)
        with app.app_context():
            pid = str(Patient.query.filter_by(patient_code="PAT-REP-001").first().id)

        res = client.get(f'/api/v1/reports/patient/{pid}/csv', headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.mimetype == "text/csv"
        assert "Report Patient" in res.get_data(as_text=True)
