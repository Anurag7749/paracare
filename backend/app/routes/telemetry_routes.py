from flask import Blueprint, request, Response
from flask_jwt_extended import jwt_required
from app.services.telemetry_service import (
    get_telemetry_history, get_telemetry_stats,
    get_telemetry_chart_data, export_telemetry_csv
)
from app.utils.decorators import get_current_user, get_accessible_patient_ids, check_patient_access
from app.utils.response import success_response

telemetry_bp = Blueprint('telemetry', __name__)


@telemetry_bp.route('/history', methods=['GET'])
@jwt_required()
def telemetry_history():
    """GET /api/v1/telemetry/history — Paginated health reading history.
    ADMIN sees all authorized readings. CAREGIVER only sees readings for
    patients assigned to them."""
    user = get_current_user()
    patient_id = request.args.get('patient_id')
    if patient_id:
        check_patient_access(user, patient_id)
        patient_ids = None
    else:
        patient_ids = get_accessible_patient_ids(user)

    result = get_telemetry_history(
        patient_id=patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date'),
        page=request.args.get('page', 1, type=int),
        per_page=request.args.get('per_page', 50, type=int),
        patient_ids=patient_ids
    )
    return success_response(data=result, message="Telemetry history retrieved")


@telemetry_bp.route('/stats', methods=['GET'])
@jwt_required()
def telemetry_stats():
    """GET /api/v1/telemetry/stats?patient_id=... — Min/Max/Avg/Latest stats."""
    patient_id = request.args.get('patient_id')
    if not patient_id:
        return success_response(data={}, message="patient_id required", status_code=400)
    check_patient_access(get_current_user(), patient_id)
    result = get_telemetry_stats(
        patient_id=patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date')
    )
    return success_response(data=result, message="Telemetry stats retrieved")


@telemetry_bp.route('/chart', methods=['GET'])
@jwt_required()
def telemetry_chart():
    """GET /api/v1/telemetry/chart?patient_id=... — Time-series chart data."""
    patient_id = request.args.get('patient_id')
    if not patient_id:
        return success_response(data=[], message="patient_id required", status_code=400)
    check_patient_access(get_current_user(), patient_id)
    result = get_telemetry_chart_data(
        patient_id=patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date'),
        limit=request.args.get('limit', 100, type=int)
    )
    return success_response(data=result, message="Chart data retrieved")


@telemetry_bp.route('/export', methods=['GET'])
@jwt_required()
def telemetry_export():
    """GET /api/v1/telemetry/export?patient_id=... — CSV export."""
    patient_id = request.args.get('patient_id')
    if not patient_id:
        return success_response(data={}, message="patient_id required", status_code=400)
    check_patient_access(get_current_user(), patient_id)
    csv_data = export_telemetry_csv(
        patient_id=patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date')
    )
    return Response(csv_data, mimetype='text/csv',
                    headers={"Content-Disposition": "attachment;filename=health_readings.csv"})
