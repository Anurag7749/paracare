from flask import Blueprint
from app.services.health_service import check_system_health
from app.utils.response import success_response, error_response

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def get_health():
    """
    GET /api/health
    Returns backend and PostgreSQL database operational status.
    """
    health_info, is_healthy = check_system_health()
    if is_healthy:
        return success_response(
            data=health_info,
            message="ParaCare backend system and database are healthy",
            status_code=200
        )
    else:
        return error_response(
            message="Database connection issue detected",
            error_code="DATABASE_UNHEALTHY",
            status_code=503,
            details=health_info
        )
