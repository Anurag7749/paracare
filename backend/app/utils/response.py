from flask import jsonify

def success_response(data=None, message="Operation successful", status_code=200):
    """Return standardized success JSON response."""
    payload = {
        "success": True,
        "message": message,
        "data": data
    }
    return jsonify(payload), status_code

def error_response(message="An error occurred", error_code="INTERNAL_ERROR", status_code=500, details=None):
    """Return standardized error JSON response."""
    payload = {
        "success": False,
        "error": {
            "code": error_code,
            "message": message,
            "details": details
        }
    }
    return jsonify(payload), status_code
