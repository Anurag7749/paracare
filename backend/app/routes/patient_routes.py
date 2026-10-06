from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.patient_service import get_patients, get_patient_by_id, create_patient, update_patient
from app.utils.decorators import get_current_user, get_accessible_patient_ids, check_patient_access, roles_required
from app.utils.response import success_response

patient_bp = Blueprint('patient', __name__)


@patient_bp.route('', methods=['GET'])
@patient_bp.route('/', methods=['GET'])
@jwt_required()
def list_patients():
    """GET /api/v1/patients — List patients with search and pagination.
    ADMIN sees all patients. CAREGIVER only sees patients assigned to them."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search = request.args.get('search')
    user = get_current_user()
    patient_ids = get_accessible_patient_ids(user)
    result = get_patients(page=page, per_page=per_page, search=search, patient_ids=patient_ids)
    return success_response(data=result, message="Patients retrieved")


@patient_bp.route('/<patient_id>', methods=['GET'])
@jwt_required()
def get_patient(patient_id):
    """GET /api/v1/patients/<id> — Patient detail with devices."""
    user = get_current_user()
    check_patient_access(user, patient_id)
    result = get_patient_by_id(patient_id)
    return success_response(data=result, message="Patient retrieved")


@patient_bp.route('', methods=['POST'])
@patient_bp.route('/', methods=['POST'])
@roles_required('ADMIN')
def add_patient():
    """POST /api/v1/patients — Create new patient. ADMIN only."""
    data = request.get_json(silent=True) or {}
    user_id = get_jwt_identity()
    result = create_patient(data, user_id=user_id)
    return success_response(data=result, message="Patient created", status_code=201)


@patient_bp.route('/<patient_id>', methods=['PUT'])
@roles_required('ADMIN')
def edit_patient(patient_id):
    """PUT /api/v1/patients/<id> — Update patient. ADMIN only."""
    data = request.get_json(silent=True) or {}
    user_id = get_jwt_identity()
    result = update_patient(patient_id, data, user_id=user_id)
    return success_response(data=result, message="Patient updated")
