import pytest
from app.extensions import db
from app.models import User, Patient, Caregiver, CaregiverPatient
from app.utils.decorators import check_patient_access
from app.errors.exceptions import ForbiddenError


@pytest.fixture(scope="module", autouse=True)
def setup_auth_test_db():
    """Ensure a clean, isolated set of tables exists for this test module.
    Scoped to the whole module (not each test) because several tests in
    this file intentionally build on state created by earlier tests in the
    same file (e.g. test_duplicate_user_registration_fails and
    test_user_login_success both depend on the user created by
    test_user_registration). Uses its own app context (independent of the
    function-scoped 'app' fixture used by individual tests) since both
    point at the same configured test database."""
    from app import create_app
    module_app = create_app('testing')
    with module_app.app_context():
        db.drop_all()
        db.create_all()
        yield
        db.session.remove()
        db.drop_all()

def test_user_registration(client, app):
    """Test POST /api/auth/register creates user, caregiver, and returns tokens."""
    payload = {
        "name": "Jane Caregiver",
        "email": "jane.caregiver@paracare.org",
        "password": "SecurePassword123!",
        "role": "CAREGIVER",
        "phone": "+1122334455",
        "whatsapp_number": "+1122334455"
    }
    response = client.post('/api/v1/auth/register', json=payload)
    assert response.status_code == 201
    json_data = response.get_json()
    assert json_data["success"] is True
    assert "access_token" in json_data["data"]
    assert "refresh_token" in json_data["data"]
    user_info = json_data["data"]["user"]
    assert user_info["email"] == "jane.caregiver@paracare.org"
    assert user_info["role"] == "CAREGIVER"
    assert "password_hash" not in user_info


def test_duplicate_user_registration_fails(client, app):
    """Test registering with an existing email returns 400 error."""
    payload = {
        "name": "Jane Caregiver",
        "email": "jane.caregiver@paracare.org",
        "password": "SecurePassword123!"
    }
    response = client.post('/api/v1/auth/register', json=payload)
    assert response.status_code == 400
    json_data = response.get_json()
    assert json_data["success"] is False
    assert json_data["error"]["code"] == "VALIDATION_ERROR"


def test_user_login_success(client, app):
    """Test POST /api/auth/login authenticates registered user."""
    payload = {
        "email": "jane.caregiver@paracare.org",
        "password": "SecurePassword123!"
    }
    response = client.post('/api/v1/auth/login', json=payload)
    assert response.status_code == 200
    json_data = response.get_json()
    assert json_data["success"] is True
    assert "access_token" in json_data["data"]
    assert "password_hash" not in json_data["data"]["user"]


def test_user_login_invalid_password(client, app):
    """Test login with wrong password fails with 401 Unauthorized."""
    payload = {
        "email": "jane.caregiver@paracare.org",
        "password": "WrongPassword!"
    }
    response = client.post('/api/v1/auth/login', json=payload)
    assert response.status_code == 401
    json_data = response.get_json()
    assert json_data["success"] is False
    assert json_data["error"]["code"] == "UNAUTHORIZED"


def test_get_me_unauthorized(client, app):
    """Test accessing /api/auth/me without token returns 401."""
    response = client.get('/api/v1/auth/me')
    assert response.status_code == 401


def test_get_me_authorized(client, app):
    """Test accessing /api/auth/me with valid Bearer token."""
    login_res = client.post('/api/v1/auth/login', json={
        "email": "jane.caregiver@paracare.org",
        "password": "SecurePassword123!"
    })
    access_token = login_res.get_json()["data"]["access_token"]

    response = client.get('/api/v1/auth/me', headers={
        "Authorization": f"Bearer {access_token}"
    })
    assert response.status_code == 200
    json_data = response.get_json()
    assert json_data["data"]["email"] == "jane.caregiver@paracare.org"
    assert "password_hash" not in json_data["data"]


def test_token_refresh(client, app):
    """Test POST /api/auth/refresh returns new access token using refresh token."""
    login_res = client.post('/api/v1/auth/login', json={
        "email": "jane.caregiver@paracare.org",
        "password": "SecurePassword123!"
    })
    refresh_token = login_res.get_json()["data"]["refresh_token"]

    response = client.post('/api/v1/auth/refresh', headers={
        "Authorization": f"Bearer {refresh_token}"
    })
    assert response.status_code == 200
    json_data = response.get_json()
    assert "access_token" in json_data["data"]


def test_patient_scoping_permissions(app):
    """Test Admin has access to all patients, Caregiver only to assigned patient."""
    with app.app_context():
        # Setup mock admin & caregiver
        admin = User(name="Admin User", email="admin.test@paracare.org", password_hash="hash", role="ADMIN")
        caregiver_user = User(name="CG User", email="cg.test@paracare.org", password_hash="hash", role="CAREGIVER")
        patient1 = Patient(patient_code="P-TEST-1", name="Patient 1", age=50)
        patient2 = Patient(patient_code="P-TEST-2", name="Patient 2", age=60)
        db.session.add_all([admin, caregiver_user, patient1, patient2])
        db.session.commit()

        cg_profile = Caregiver(user_id=caregiver_user.id, phone="123")
        db.session.add(cg_profile)
        db.session.commit()

        # Assign patient1 to caregiver_user
        assignment = CaregiverPatient(caregiver_id=cg_profile.id, patient_id=patient1.id)
        db.session.add(assignment)
        db.session.commit()

        # Admin access
        assert check_patient_access(admin, patient1.id) is True
        assert check_patient_access(admin, patient2.id) is True

        # Caregiver access
        assert check_patient_access(caregiver_user, patient1.id) is True
        with pytest.raises(ForbiddenError):
            check_patient_access(caregiver_user, patient2.id)
