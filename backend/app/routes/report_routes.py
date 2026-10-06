from flask import Blueprint, request, Response
from flask_jwt_extended import jwt_required
from app.services.report_service import generate_patient_report, export_report_csv
from app.utils.decorators import get_current_user, check_patient_access
from app.utils.response import success_response

report_bp = Blueprint('report', __name__)


@report_bp.route('/patient/<patient_id>', methods=['GET'])
@jwt_required()
def patient_report(patient_id):
    """GET /api/v1/reports/patient/<id> — Generate comprehensive patient report."""
    check_patient_access(get_current_user(), patient_id)
    result = generate_patient_report(
        patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date')
    )
    return success_response(data=result, message="Report generated")


@report_bp.route('/patient/<patient_id>/csv', methods=['GET'])
@jwt_required()
def patient_report_csv(patient_id):
    """GET /api/v1/reports/patient/<id>/csv — Export patient report as CSV."""
    check_patient_access(get_current_user(), patient_id)
    csv_data = export_report_csv(
        patient_id,
        start_date=request.args.get('start_date'),
        end_date=request.args.get('end_date')
    )
    return Response(csv_data, mimetype='text/csv',
                    headers={"Content-Disposition": f"attachment;filename=paracare_report_{patient_id[:8]}.csv"})
