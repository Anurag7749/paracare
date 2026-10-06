"""
Tests for ParaCare blink command validation and classification service.

Covers:
  - 1 blink (NORMAL_BLINK)
  - 2 blinks within 2s (NEED_WATER)
  - 3 blinks within 2s (NEED_FOOD)
  - 4 blinks within 2s (NEED_MEDICINE)
  - 5+ blinks (rejected as NORMAL_BLINK)
  - Blinks outside the 2-second window
  - 3-second continuous eye closure (EMERGENCY)
  - Invalid command string
  - Invalid / edge-case durations
"""

import pytest
from app.services.blink_service import (
    classify_blink,
    validate_blink_command,
    normalize_blink_data,
    BLINK_WINDOW_SECONDS,
    SOS_HOLD_SECONDS,
    MAX_BLINK_COUNT,
)
from app.extensions import db
from app.models.blink_event import CommandEnum, SeverityEnum


# ═══════════════════════════════════════════════════════════════════════════════
# classify_blink() — FSM Classification Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestClassifyBlink:
    """Test classify_blink() against all FSM rules."""

    # ── 1 Blink = NORMAL_BLINK ──────────────────────────────────────────────

    def test_1_blink_normal(self):
        """1 blink should be classified as NORMAL_BLINK."""
        result = classify_blink(blink_count=1, duration_seconds=0.2)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value
        assert result["severity"] == SeverityEnum.LOW.value
        assert result["is_actionable"] is False

    def test_1_blink_zero_duration(self):
        """1 blink with zero duration should still be NORMAL_BLINK."""
        result = classify_blink(blink_count=1, duration_seconds=0)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value
        assert result["is_actionable"] is False

    # ── 2 Blinks within 2s = NEED_WATER ─────────────────────────────────────

    def test_2_blinks_within_window(self):
        """2 blinks within 2 seconds should be NEED_WATER."""
        result = classify_blink(blink_count=2, duration_seconds=1.4)
        assert result["command"] == CommandEnum.NEED_WATER.value
        assert result["severity"] == SeverityEnum.MEDIUM.value
        assert result["is_actionable"] is True

    def test_2_blinks_at_boundary(self):
        """2 blinks at exactly 2.0 seconds should be NEED_WATER."""
        result = classify_blink(blink_count=2, duration_seconds=2.0)
        assert result["command"] == CommandEnum.NEED_WATER.value
        assert result["is_actionable"] is True

    def test_2_blinks_fast(self):
        """2 blinks in 0.5 seconds should be NEED_WATER."""
        result = classify_blink(blink_count=2, duration_seconds=0.5)
        assert result["command"] == CommandEnum.NEED_WATER.value

    # ── 3 Blinks within 2s = NEED_FOOD ──────────────────────────────────────

    def test_3_blinks_within_window(self):
        """3 blinks within 2 seconds should be NEED_FOOD."""
        result = classify_blink(blink_count=3, duration_seconds=1.8)
        assert result["command"] == CommandEnum.NEED_FOOD.value
        assert result["severity"] == SeverityEnum.MEDIUM.value
        assert result["is_actionable"] is True

    def test_3_blinks_at_boundary(self):
        """3 blinks at exactly 2.0 seconds should be NEED_FOOD."""
        result = classify_blink(blink_count=3, duration_seconds=2.0)
        assert result["command"] == CommandEnum.NEED_FOOD.value

    # ── 4 Blinks within 2s = NEED_MEDICINE ──────────────────────────────────

    def test_4_blinks_within_window(self):
        """4 blinks within 2 seconds should be NEED_MEDICINE."""
        result = classify_blink(blink_count=4, duration_seconds=1.9)
        assert result["command"] == CommandEnum.NEED_MEDICINE.value
        assert result["severity"] == SeverityEnum.HIGH.value
        assert result["is_actionable"] is True

    def test_4_blinks_fast(self):
        """4 blinks in 1.0 second should be NEED_MEDICINE."""
        result = classify_blink(blink_count=4, duration_seconds=1.0)
        assert result["command"] == CommandEnum.NEED_MEDICINE.value

    # ── 5+ Blinks = EMERGENCY SOS (Mandatory Rule) ──────────────────────────

    def test_5_blinks_emergency(self):
        """5 blinks should be classified as EMERGENCY."""
        result = classify_blink(blink_count=5, duration_seconds=1.8)
        assert result["command"] == CommandEnum.EMERGENCY.value
        assert result["severity"] == SeverityEnum.CRITICAL.value
        assert result["is_actionable"] is True

    def test_6_blinks_emergency(self):
        """6 blinks should be classified as EMERGENCY."""
        result = classify_blink(blink_count=6, duration_seconds=1.5)
        assert result["command"] == CommandEnum.EMERGENCY.value
        assert result["severity"] == SeverityEnum.CRITICAL.value
        assert result["is_actionable"] is True

    def test_10_blinks_emergency(self):
        """10 blinks should be classified as EMERGENCY."""
        result = classify_blink(blink_count=10, duration_seconds=1.0)
        assert result["command"] == CommandEnum.EMERGENCY.value
        assert result["severity"] == SeverityEnum.CRITICAL.value
        assert result["is_actionable"] is True

    # ── Blinks Outside 7-Second Window ──────────────────────────────────────

    def test_2_blinks_outside_window(self):
        """2 blinks over 7.5 seconds should be NORMAL_BLINK (outside 7s window)."""
        result = classify_blink(blink_count=2, duration_seconds=7.5)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value
        assert result["is_actionable"] is False
        assert "exceeds" in result["description"].lower()

    def test_3_blinks_outside_window(self):
        """3 blinks over 8.0 seconds should be NORMAL_BLINK (outside 7s window)."""
        result = classify_blink(blink_count=3, duration_seconds=8.0)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value

    def test_4_blinks_outside_window(self):
        """4 blinks over 7.1 seconds should be NORMAL_BLINK."""
        result = classify_blink(blink_count=4, duration_seconds=7.1)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value

    # ── Continuous Eye Closure >= 3 Seconds = EMERGENCY ─────────────────────

    def test_3_second_closure_emergency(self):
        """Continuous eye closure of exactly 3.0 seconds should be EMERGENCY."""
        result = classify_blink(blink_count=1, duration_seconds=3.0)
        assert result["command"] == CommandEnum.EMERGENCY.value
        assert result["severity"] == SeverityEnum.CRITICAL.value
        assert result["is_actionable"] is True

    def test_3_5_second_closure_emergency(self):
        """3.5 second eye closure should be EMERGENCY."""
        result = classify_blink(blink_count=1, duration_seconds=3.5)
        assert result["command"] == CommandEnum.EMERGENCY.value

    def test_5_second_closure_emergency(self):
        """5 second eye closure should be EMERGENCY."""
        result = classify_blink(blink_count=1, duration_seconds=5.0)
        assert result["command"] == CommandEnum.EMERGENCY.value

    def test_2_blinks_3_5s_is_water(self):
        """2 blinks within 3.5s is within 7s window -> NEED_WATER."""
        result = classify_blink(blink_count=2, duration_seconds=3.5)
        assert result["command"] == CommandEnum.NEED_WATER.value

    def test_2_99s_not_emergency(self):
        """2.99 seconds should NOT trigger EMERGENCY for a single blink."""
        result = classify_blink(blink_count=1, duration_seconds=2.99)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value


    # ── Edge Cases ──────────────────────────────────────────────────────────

    def test_zero_blinks(self):
        """0 blinks should be NORMAL_BLINK."""
        result = classify_blink(blink_count=0, duration_seconds=0)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value

    def test_none_inputs(self):
        """None inputs should not crash, should default to NORMAL_BLINK."""
        result = classify_blink(blink_count=None, duration_seconds=None)
        assert result["command"] == CommandEnum.NORMAL_BLINK.value


# ═══════════════════════════════════════════════════════════════════════════════
# validate_blink_command() — ESP32 Command Cross-Check Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestValidateBlinkCommand:
    """Test validate_blink_command() cross-checking ESP32 commands."""

    def test_valid_consistent_need_water(self):
        """ESP32 sends NEED_WATER for 2 blinks — valid and consistent."""
        result = validate_blink_command("NEED_WATER", blink_count=2, duration_seconds=1.4)
        assert result["is_valid"] is True
        assert result["is_consistent"] is True
        assert result["normalized_command"] == CommandEnum.NEED_WATER.value
        assert result["is_actionable"] is True

    def test_valid_consistent_emergency(self):
        """ESP32 sends EMERGENCY for 3.5s closure — valid and consistent."""
        result = validate_blink_command("EMERGENCY", blink_count=1, duration_seconds=3.5)
        assert result["is_valid"] is True
        assert result["is_consistent"] is True
        assert result["normalized_command"] == CommandEnum.EMERGENCY.value

    def test_valid_but_inconsistent(self):
        """ESP32 sends NEED_FOOD for 2 blinks — valid but backend would expect NEED_WATER."""
        result = validate_blink_command("NEED_FOOD", blink_count=2, duration_seconds=1.2)
        assert result["is_valid"] is True
        assert result["is_consistent"] is False
        assert result["received_command"] == CommandEnum.NEED_FOOD.value
        assert result["expected_command"] == CommandEnum.NEED_WATER.value
        # Still trusts ESP32 since the command is valid
        assert result["normalized_command"] == CommandEnum.NEED_FOOD.value

    def test_invalid_command_string(self):
        """ESP32 sends 'DANCE' — invalid, falls back to backend classification."""
        result = validate_blink_command("DANCE", blink_count=3, duration_seconds=1.5)
        assert result["is_valid"] is False
        assert result["is_consistent"] is False
        assert result["normalized_command"] == CommandEnum.NEED_FOOD.value

    def test_empty_command_string(self):
        """Empty command falls back to backend classification."""
        result = validate_blink_command("", blink_count=4, duration_seconds=1.8)
        assert result["is_valid"] is False
        assert result["normalized_command"] == CommandEnum.NEED_MEDICINE.value

    def test_none_command(self):
        """None command falls back to backend classification."""
        result = validate_blink_command(None, blink_count=2, duration_seconds=1.0)
        assert result["is_valid"] is False
        assert result["normalized_command"] == CommandEnum.NEED_WATER.value

    def test_case_insensitive_command(self):
        """Lowercase 'need_water' should still be valid (uppercased internally)."""
        result = validate_blink_command("need_water", blink_count=2, duration_seconds=1.4)
        assert result["is_valid"] is True
        assert result["normalized_command"] == CommandEnum.NEED_WATER.value


# ═══════════════════════════════════════════════════════════════════════════════
# normalize_blink_data() — Payload Enrichment Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestNormalizeBlinkData:
    """Test normalize_blink_data() payload enrichment."""

    def test_enriches_valid_payload(self):
        """A valid payload should be enriched with severity and validation metadata."""
        data = {
            "device_id": "ESP32-001",
            "patient_id": "PAT-001",
            "command": "NEED_WATER",
            "blink_count": 2,
            "blink_duration": 1.4,
            "heart_rate": 78,
        }
        enriched = normalize_blink_data(data)
        assert enriched["command"] == CommandEnum.NEED_WATER.value
        assert enriched["severity"] == SeverityEnum.MEDIUM.value
        assert enriched["_blink_validation"]["is_valid"] is True
        # Original fields preserved
        assert enriched["heart_rate"] == 78
        assert enriched["device_id"] == "ESP32-001"

    def test_normalizes_invalid_command(self):
        """An invalid command should be replaced by backend FSM classification."""
        data = {
            "command": "JUMP",
            "blink_count": 3,
            "blink_duration": 1.5,
        }
        enriched = normalize_blink_data(data)
        assert enriched["command"] == CommandEnum.NEED_FOOD.value
        assert enriched["_blink_validation"]["is_valid"] is False

    def test_emergency_normalization(self):
        """Emergency closure data should normalize to EMERGENCY with CRITICAL severity."""
        data = {
            "command": "EMERGENCY",
            "blink_count": 1,
            "blink_duration": 3.5,
        }
        enriched = normalize_blink_data(data)
        assert enriched["command"] == CommandEnum.EMERGENCY.value
        assert enriched["severity"] == SeverityEnum.CRITICAL.value
        assert enriched["_blink_validation"]["is_actionable"] is True

    def test_missing_command_defaults(self):
        """Missing command should fall back to FSM classification."""
        data = {
            "blink_count": 4,
            "blink_duration": 1.9,
        }
        enriched = normalize_blink_data(data)
        assert enriched["command"] == CommandEnum.NEED_MEDICINE.value

    def test_does_not_mutate_original(self):
        """normalize_blink_data should not mutate the original data dict."""
        data = {"command": "NEED_WATER", "blink_count": 2, "blink_duration": 1.2}
        original_command = data["command"]
        _ = normalize_blink_data(data)
        assert data["command"] == original_command
        assert "_blink_validation" not in data


# ═══════════════════════════════════════════════════════════════════════════════
# Invalid Duration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestInvalidDuration:
    """Test edge cases with invalid or boundary duration values."""

    def test_negative_duration(self):
        """Negative duration should not crash, treated as 0."""
        result = classify_blink(blink_count=2, duration_seconds=-1.0)
        assert result["command"] == CommandEnum.NEED_WATER.value

    def test_very_large_duration(self):
        """Very large duration should trigger EMERGENCY."""
        result = classify_blink(blink_count=1, duration_seconds=999.0)
        assert result["command"] == CommandEnum.EMERGENCY.value

    def test_fractional_blink_count(self):
        """Fractional blink count should be truncated to int."""
        result = classify_blink(blink_count=2.7, duration_seconds=1.0)
        assert result["command"] == CommandEnum.NEED_WATER.value


# ═══════════════════════════════════════════════════════════════════════════════
# Camera & Direct Blink Event API Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCameraBlinkEndpoint:
    """Test POST /api/v1/blink-events endpoint with source=CAMERA."""

    @pytest.fixture(autouse=True)
    def setup_db(self, app):
        with app.app_context():
            db.drop_all()
            db.create_all()
            yield
            db.session.remove()
            db.drop_all()

    def test_camera_blink_need_food(self, client, app):
        from app.models import User, Patient, Caregiver, CaregiverPatient
        from werkzeug.security import generate_password_hash

        with app.app_context():
            user = User(name="Cam Caregiver", email="cam_cg@test.org", password_hash=generate_password_hash("Pass123!"), role="CAREGIVER")
            patient = Patient(patient_code="PAT-CAM-001", name="Cam Patient", age=45)
            db.session.add_all([user, patient])
            db.session.commit()

            caregiver = Caregiver(user_id=user.id, phone="+1234567890")
            db.session.add(caregiver)
            db.session.commit()

            assignment = CaregiverPatient(caregiver_id=caregiver.id, patient_id=patient.id)
            db.session.add(assignment)
            db.session.commit()


        # Login
        login_res = client.post('/api/v1/auth/login', json={"email": "cam_cg@test.org", "password": "Pass123!"})
        token = login_res.get_json()["data"]["access_token"]

        # Send 3 blinks (NEED_FOOD) from CAMERA
        payload = {
            "source": "CAMERA",
            "blink_count": 3,
            "duration_seconds": 7.0,
            "patient_id": "PAT-CAM-001"
        }
        res = client.post('/api/v1/blink-events', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "NEED_FOOD"
        assert data["source"] == "CAMERA"
        assert data["alert_id"] is not None

    def test_camera_blink_emergency_5_blinks(self, client, app):
        from app.models import User, Patient, Caregiver, CaregiverPatient
        from werkzeug.security import generate_password_hash

        with app.app_context():
            user = User(name="Cam Caregiver", email="cam_cg@test.org", password_hash=generate_password_hash("Pass123!"), role="CAREGIVER")
            patient = Patient(patient_code="PAT-CAM-002", name="Emergency Patient", age=60)
            db.session.add_all([user, patient])
            db.session.commit()

            caregiver = Caregiver(user_id=user.id, phone="+1234567890")
            db.session.add(caregiver)
            db.session.commit()

            assignment = CaregiverPatient(caregiver_id=caregiver.id, patient_id=patient.id)
            db.session.add(assignment)
            db.session.commit()


        login_res = client.post('/api/v1/auth/login', json={"email": "cam_cg@test.org", "password": "Pass123!"})
        token = login_res.get_json()["data"]["access_token"]

        payload = {
            "source": "CAMERA",
            "blink_count": 5,
            "duration_seconds": 4.2
        }
        res = client.post('/api/v1/blink-events/detect', json=payload, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "EMERGENCY"
        assert data["severity"] == "CRITICAL"
        assert data["alert_id"] is not None


class TestDataIsolationAndFutureIoT:
    """Test strict caregiver-patient data isolation and future IoT glasses compatibility."""

    @pytest.fixture(autouse=True)
    def setup_db(self, app):
        with app.app_context():
            db.drop_all()
            db.create_all()
            yield
            db.session.remove()
            db.drop_all()

    def test_strict_caregiver_data_isolation(self, client, app):
        """Verify Caregiver A cannot access Patient B's data (reports, alerts, history)."""
        from app.models import User, Patient, Caregiver, CaregiverPatient
        from werkzeug.security import generate_password_hash

        with app.app_context():
            # Caregiver A -> Patient A
            cg_a_user = User(name="Caregiver A", email="cg_a@test.org", password_hash=generate_password_hash("Pass123!"), role="CAREGIVER")
            pat_a = Patient(patient_code="PAT-A", name="Patient A", age=50)
            db.session.add_all([cg_a_user, pat_a])
            db.session.commit()

            cg_a = Caregiver(user_id=cg_a_user.id, phone="+1111111111")
            db.session.add(cg_a)
            db.session.commit()
            db.session.add(CaregiverPatient(caregiver_id=cg_a.id, patient_id=pat_a.id))
            db.session.commit()

            # Caregiver B -> Patient B
            cg_b_user = User(name="Caregiver B", email="cg_b@test.org", password_hash=generate_password_hash("Pass123!"), role="CAREGIVER")
            pat_b = Patient(patient_code="PAT-B", name="Patient B", age=65)
            db.session.add_all([cg_b_user, pat_b])
            db.session.commit()

            cg_b = Caregiver(user_id=cg_b_user.id, phone="+2222222222")
            db.session.add(cg_b)
            db.session.commit()
            db.session.add(CaregiverPatient(caregiver_id=cg_b.id, patient_id=pat_b.id))
            db.session.commit()

            pat_a_id = str(pat_a.id)
            pat_b_id = str(pat_b.id)

        # Login as Caregiver A
        login_a = client.post('/api/v1/auth/login', json={"email": "cg_a@test.org", "password": "Pass123!"})
        token_a = login_a.get_json()["data"]["access_token"]

        # Caregiver A submits blink event for Patient A -> PASS
        res_a = client.post('/api/v1/blink-events', json={
            "source": "CAMERA",
            "blink_count": 2,
            "duration_seconds": 6.5,
            "patient_id": pat_a_id
        }, headers={"Authorization": f"Bearer {token_a}"})
        assert res_a.status_code == 201
        assert res_a.get_json()["data"]["command_processed"] == "NEED_WATER"

        # Caregiver A tries to submit blink event for Patient B -> HTTP 403 FORBIDDEN
        res_forbidden = client.post('/api/v1/blink-events', json={
            "source": "CAMERA",
            "blink_count": 2,
            "duration_seconds": 6.5,
            "patient_id": pat_b_id
        }, headers={"Authorization": f"Bearer {token_a}"})
        assert res_forbidden.status_code == 403

        # Caregiver A tries to access Patient B report -> HTTP 403 FORBIDDEN
        res_rep = client.get(f'/api/v1/reports/patient/{pat_b_id}', headers={"Authorization": f"Bearer {token_a}"})
        assert res_rep.status_code == 403

        # Caregiver A views alerts -> only sees Patient A's alerts
        res_alerts = client.get('/api/v1/alerts', headers={"Authorization": f"Bearer {token_a}"})
        assert res_alerts.status_code == 200
        items = res_alerts.get_json()["data"]["items"]
        assert len(items) == 1
        assert items[0]["patient_id"] == pat_a_id

    def test_future_iot_glasses_source_compatibility(self, client, app):
        """Verify future IoT glasses input source produces identical command resolution and alert."""
        from app.models import User, Patient, Caregiver, CaregiverPatient
        from werkzeug.security import generate_password_hash

        with app.app_context():
            user = User(name="IoT Caregiver", email="iot_cg@test.org", password_hash=generate_password_hash("Pass123!"), role="CAREGIVER")
            patient = Patient(patient_code="PAT-IOT-001", name="IoT Patient", age=55)
            db.session.add_all([user, patient])
            db.session.commit()

            caregiver = Caregiver(user_id=user.id, phone="+1234567890")
            db.session.add(caregiver)
            db.session.commit()
            db.session.add(CaregiverPatient(caregiver_id=caregiver.id, patient_id=patient.id))
            db.session.commit()
            pat_id = str(patient.id)

        login_res = client.post('/api/v1/auth/login', json={"email": "iot_cg@test.org", "password": "Pass123!"})
        token = login_res.get_json()["data"]["access_token"]

        # Send 4 blinks from IOT_GLASSES source -> NEED_MEDICINE
        res = client.post('/api/v1/blink-events', json={
            "source": "IOT_GLASSES",
            "blink_count": 4,
            "duration_seconds": 6.8,
            "patient_id": pat_id
        }, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 201
        data = res.get_json()["data"]
        assert data["command_processed"] == "NEED_MEDICINE"
        assert data["source"] == "IOT_GLASSES"
        assert data["alert_id"] is not None
        assert data["severity"] == "HIGH"

