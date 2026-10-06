from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from app.services.blink_history_service import get_blink_history, get_blink_summary
from app.services.blink_service import process_blink_event
from app.utils.decorators import get_current_user, get_accessible_patient_ids, check_patient_access
from app.utils.response import success_response

blink_bp = Blueprint('blink', __name__)


@blink_bp.route('', methods=['GET'])
@blink_bp.route('/', methods=['GET'])
@jwt_required()
def list_blink_events():
    """GET /api/v1/blink-events — Paginated blink event history with filters.
    ADMIN sees all authorized events. CAREGIVER only sees events for
    patients assigned to them."""
    user = get_current_user()
    patient_id = request.args.get('patient_id')
    if patient_id:
        check_patient_access(user, patient_id)
        patient_ids = None
    else:
        patient_ids = get_accessible_patient_ids(user)

    result = get_blink_history(
        patient_id=patient_id,
        command=request.args.get('command'),
        source=request.args.get('source'),
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date'),
        page=request.args.get('page', 1, type=int),
        per_page=request.args.get('per_page', 50, type=int),
        patient_ids=patient_ids
    )
    return success_response(data=result, message="Blink events retrieved")


@blink_bp.route('', methods=['POST'])
@blink_bp.route('/', methods=['POST'])
@blink_bp.route('/detect', methods=['POST'])
@blink_bp.route('/camera', methods=['POST'])
@jwt_required()
def record_blink_event():
    """POST /api/v1/blink-events — Authoritative classification & storage of blink event from Camera or client.
    Enforces mandatory 7-second rule:
      1 blink -> NORMAL_BLINK
      2 blinks -> NEED_WATER
      3 blinks -> NEED_FOOD
      4 blinks -> NEED_MEDICINE
      5+ blinks -> EMERGENCY
    """
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    result = process_blink_event(data, current_user=user)
    return success_response(
        data=result,
        message=f"Blink event processed: {result['command_processed']}",
        status_code=201
    )


@blink_bp.route('/summary', methods=['GET'])
@jwt_required()
def blink_summary():
    """GET /api/v1/blink-events/summary — Command distribution stats."""
    user = get_current_user()
    patient_id = request.args.get('patient_id')
    if patient_id:
        check_patient_access(user, patient_id)
        patient_ids = None
    else:
        patient_ids = get_accessible_patient_ids(user)

    result = get_blink_summary(
        patient_id=patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date'),
        patient_ids=patient_ids
    )
    return success_response(data=result, message="Blink summary retrieved")

