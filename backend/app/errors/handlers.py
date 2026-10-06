from flask import current_app
from app.errors.exceptions import APIException
from app.utils.response import error_response
from app.extensions import jwt

def register_error_handlers(app):
    """Register centralized error handlers for HTTP and JWT errors."""
    
    @app.errorhandler(APIException)
    def handle_api_exception(e):
        return error_response(
            message=e.message,
            error_code=e.error_code,
            status_code=e.status_code,
            details=e.details
        )

    @app.errorhandler(404)
    def handle_404(e):
        return error_response(
            message="Endpoint not found",
            error_code="NOT_FOUND",
            status_code=404
        )

    @app.errorhandler(405)
    def handle_405(e):
        return error_response(
            message="Method not allowed",
            error_code="METHOD_NOT_ALLOWED",
            status_code=405
        )

    @app.errorhandler(500)
    def handle_500(e):
        app.logger.error(f"Internal Server Error: {str(e)}")
        return error_response(
            message="Internal server error",
            error_code="INTERNAL_SERVER_ERROR",
            status_code=500
        )

    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        app.logger.error(f"Unhandled Exception: {str(e)}", exc_info=True)
        return error_response(
            message="An unexpected error occurred",
            error_code="UNHANDLED_EXCEPTION",
            status_code=500
        )

    # JWT Error Callbacks
    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return error_response(
            message=f"Invalid token: {reason}",
            error_code="INVALID_TOKEN",
            status_code=401
        )

    @jwt.unauthorized_loader
    def missing_token_callback(reason):
        return error_response(
            message=f"Missing Authorization Header: {reason}",
            error_code="UNAUTHORIZED",
            status_code=401
        )

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return error_response(
            message="Token has expired",
            error_code="EXPIRED_TOKEN",
            status_code=401
        )
