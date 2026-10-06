from datetime import datetime, timezone
from sqlalchemy import text
from app.extensions import db

def check_system_health():
    """
    Business logic service to perform system health check.
    Checks PostgreSQL database connectivity and returns status.
    """
    backend_status = "healthy"
    database_status = "unknown"
    db_error_message = None

    try:
        # Active PostgreSQL connection check
        db.session.execute(text("SELECT 1"))
        database_status = "connected"
    except Exception as e:
        database_status = "disconnected"
        db_error_message = str(e)

    health_info = {
        "backend_status": backend_status,
        "database_status": database_status,
        "database_engine": "PostgreSQL",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    if db_error_message:
        health_info["database_error"] = db_error_message

    is_healthy = (database_status == "connected")
    return health_info, is_healthy
