from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.caregiver_service import get_caregivers, assign_patient_to_caregiver
from app.utils.decorators import roles_required
from app.utils.response import success_response

caregiver_bp = Blueprint('caregiver', __name__)


@caregiver_bp.route('', methods=['GET'])
@caregiver_bp.route('/', methods=['GET'])
@roles_required('ADMIN')
def list_caregivers():
    """GET /api/v1/caregivers — List all caregivers with assigned patients. ADMIN only."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    result = get_caregivers(page=page, per_page=per_page)
    return success_response(data=result, message="Caregivers retrieved")


@caregiver_bp.route('/<caregiver_id>/assign', methods=['POST'])
@roles_required('ADMIN')
def assign_patient(caregiver_id):
    """POST /api/v1/caregivers/<id>/assign — Assign patient to caregiver. ADMIN only."""
    data = request.get_json(silent=True) or {}
    user_id = get_jwt_identity()
    result = assign_patient_to_caregiver(caregiver_id, data.get('patient_id'), user_id=user_id)
    return success_response(data=result, message="Patient assigned", status_code=201)
