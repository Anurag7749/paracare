from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.alert_service import (
    get_alerts, get_alert_by_id, acknowledge_alert, resolve_alert
)
from app.utils.decorators import get_current_user, get_accessible_patient_ids, check_patient_access
from app.utils.response import success_response

alert_bp = Blueprint('alert', __name__)


@alert_bp.route('', methods=['GET'])
@alert_bp.route('/', methods=['GET'])
@jwt_required()
def list_alerts():
    """
    GET /api/alerts
    GET /api/alerts?patient_id=<uuid>&status=PENDING&severity=CRITICAL&page=1&per_page=20

    Query alerts with optional filtering and pagination.
    ADMIN sees all authorized alerts. CAREGIVER only sees alerts for
    patients assigned to them.
    """
    patient_id = request.args.get('patient_id')
    status = request.args.get('status')
    severity = request.args.get('severity')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    user = get_current_user()
    if patient_id:
        # Requesting a specific patient's alerts - must be authorized for it.
        check_patient_access(user, patient_id)
        patient_ids = None
    else:
        # No specific patient requested - scope to what this user can see.
        patient_ids = get_accessible_patient_ids(user)

    result = get_alerts(
        patient_id=patient_id,
        status=status,
        severity=severity,
        page=page,
        per_page=per_page,
        patient_ids=patient_ids
    )
    return success_response(
        data=result,
        message="Alerts retrieved successfully"
    )


@alert_bp.route('/<alert_id>', methods=['GET'])
@jwt_required()
def get_single_alert(alert_id):
    """
    GET /api/alerts/<id>

    Get a single alert with full details including patient info,
    blink event, and notification logs.
    """
    user = get_current_user()
    result = get_alert_by_id(alert_id)
    check_patient_access(user, result['patient_id'])
    return success_response(
        data=result,
        message="Alert details retrieved successfully"
    )


@alert_bp.route('/<alert_id>/acknowledge', methods=['POST'])
@jwt_required()
def acknowledge(alert_id):
    """
    POST /api/alerts/<id>/acknowledge

    Acknowledge a pending alert. Records acknowledging caregiver
    and timestamp. Triggers audit log.
    """
    user = get_current_user()
    current_user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    notes = data.get('notes')

    existing = get_alert_by_id(alert_id)
    check_patient_access(user, existing['patient_id'])

    result = acknowledge_alert(alert_id, current_user_id, notes=notes)
    return success_response(
        data=result,
        message="Alert acknowledged successfully"
    )


@alert_bp.route('/<alert_id>/resolve', methods=['POST'])
@jwt_required()
def resolve(alert_id):
    """
    POST /api/alerts/<id>/resolve

    Resolve an alert (marks as fully handled).
    """
    user = get_current_user()
    current_user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    notes = data.get('notes')

    existing = get_alert_by_id(alert_id)
    check_patient_access(user, existing['patient_id'])

    result = resolve_alert(alert_id, current_user_id, notes=notes)
    return success_response(
        data=result,
        message="Alert resolved successfully"
    )
