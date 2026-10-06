from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.auth_service import (
    register_user, authenticate_user, refresh_user_token, get_user_profile
)
from app.utils.decorators import roles_required
from app.utils.response import success_response

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    """
    POST /api/auth/register
    Public self-registration. Always creates a CAREGIVER account -
    any 'role' field sent by the client is ignored for security reasons.
    ADMIN accounts cannot be created through this endpoint.
    """
    data = request.get_json(silent=True) or {}
    result = register_user(data, allow_admin=False)
    return success_response(
        data=result,
        message="User registered successfully",
        status_code=201
    )


@auth_bp.route('/register-admin', methods=['POST'])
@roles_required('ADMIN')
def register_admin():
    """
    POST /api/auth/register-admin
    ADMIN-only endpoint to create additional ADMIN or CAREGIVER accounts.
    Requires a valid ADMIN JWT access token.
    """
    data = request.get_json(silent=True) or {}
    result = register_user(data, allow_admin=True)
    return success_response(
        data=result,
        message="User registered successfully",
        status_code=201
    )


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    POST /api/auth/login
    Authenticates user and returns JWT access & refresh tokens.
    """
    data = request.get_json(silent=True) or {}
    result = authenticate_user(
        email=data.get('email'),
        password=data.get('password')
    )
    return success_response(
        data=result,
        message="Authentication successful",
        status_code=200
    )


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    POST /api/auth/refresh
    Generates a new access token using a valid refresh token.
    """
    current_user_id = get_jwt_identity()
    result = refresh_user_token(current_user_id)
    return success_response(
        data=result,
        message="Token refreshed successfully",
        status_code=200
    )


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_me():
    """
    GET /api/auth/me
    Returns current user profile and assigned caregiver patient data.
    """
    current_user_id = get_jwt_identity()
    user_profile = get_user_profile(current_user_id)
    return success_response(
        data=user_profile,
        message="User profile retrieved successfully",
        status_code=200
    )
