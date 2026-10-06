import pytest
from app.extensions import db
from app.models import User, Patient, Device, SourceEnum
from werkzeug.security import generate_password_hash

@pytest.fixture(autouse=True)
def setup_sim_data(app):
    with app.app_context():
        db.drop_all()
        db.create_all()
        user = User(name="CG User", email="sim_cg@test.org", password_hash=generate_password_hash("Pass123!"), role="CAREGIVER")
        patient = Patient(patient_code="PAT-SIM-001", name="Sim Patient", age=50)
        db.session.add_all([user, patient])
        db.session.commit()

        device = Device(device_id="SIM-DEV-001", patient_id=patient.id, device_name="Sim Glasses", is_online=True)
        db.session.add(device)
        db.session.commit()

        yield
        db.session.remove()
        db.drop_all()

def _get_token(client):
    res = client.post('/api/v1/auth/login', json={"email": "sim_cg@test.org", "password": "Pass123!"})
    return res.get_json()["data"]["access_token"]

class TestSimulatorEndpoint:
    def test_simulate_need_water(self, client):
        token = _get_token(client)
        payload = {"command": "NEED_WATER", "blink_count": 2, "blink_duration": 1.4}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "NEED_WATER"
        assert data["source"] == SourceEnum.SIMULATOR.value
        assert data["demo_mode"] is True

    def test_simulate_need_food(self, client):
        token = _get_token(client)
        payload = {"command": "NEED_FOOD", "blink_count": 3, "blink_duration": 1.8}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "NEED_FOOD"

    def test_simulate_need_medicine(self, client):
        token = _get_token(client)
        payload = {"command": "NEED_MEDICINE", "blink_count": 4, "blink_duration": 2.0}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "NEED_MEDICINE"

    def test_simulate_emergency_hold(self, client):
        token = _get_token(client)
        payload = {"command": "EMERGENCY", "blink_count": 1, "blink_duration": 3.5}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "EMERGENCY"
        assert data["alert_id"] is not None

    def test_simulate_emergency_5_blinks(self, client):
        token = _get_token(client)
        payload = {"blink_count": 5, "blink_duration": 4.0}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "EMERGENCY"
        assert data["alert_id"] is not None

    def test_simulate_emergency_6_blinks(self, client):
        token = _get_token(client)
        payload = {"blink_count": 6, "blink_duration": 4.5}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "EMERGENCY"

    def test_simulate_emergency_10_blinks(self, client):
        token = _get_token(client)
        payload = {"blink_count": 10, "blink_duration": 5.0}
        res = client.post('/api/v1/simulator/blink', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "EMERGENCY"

