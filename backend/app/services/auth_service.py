from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, create_refresh_token
from app.extensions import db
from app.models import User, Caregiver
from app.errors.exceptions import ValidationError, UnauthorizedError, NotFoundError
from app.services.audit_service import log_audit

def register_user(data, allow_admin=False):
    """
    Registers a new user (and optional Caregiver profile).
    Generates JWT access and refresh tokens.

    SECURITY: Public/unauthenticated registration (allow_admin=False) always
    creates a CAREGIVER account. Any 'role' value supplied by the client is
    ignored in that case, so a caller cannot self-elevate to ADMIN by simply
    sending {"role": "ADMIN"}. ADMIN accounts may only be created by an
    already-authenticated ADMIN via register_admin_user(), which passes
    allow_admin=True.
    """
    email = data.get('email', '').strip().lower()
    name = data.get('name', '').strip()
    password = data.get('password', '')
    phone = data.get('phone', '')
    whatsapp_number = data.get('whatsapp_number', phone)

    requested_role = (data.get('role') or 'CAREGIVER').upper()
    if allow_admin:
        if requested_role not in ['ADMIN', 'CAREGIVER']:
            raise ValidationError("Invalid role. Allowed roles: ADMIN, CAREGIVER")
        role = requested_role
    else:
        # Public registration can never create ADMIN accounts, regardless
        # of what the client sends.
        role = 'CAREGIVER'

    if not email or not name or not password:
        raise ValidationError("Name, email, and password are required")

    if len(password) < 8:
        raise ValidationError("Password must be at least 8 characters long")

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        raise ValidationError(f"Email '{email}' is already registered")

    # Hash password securely
    password_hash = generate_password_hash(password)

    user = User(
        name=name,
        email=email,
        password_hash=password_hash,
        role=role,
        is_active=True
    )
    db.session.add(user)
    db.session.commit()

    # Create Caregiver profile if role is CAREGIVER
    if role == 'CAREGIVER':
        caregiver = Caregiver(
            user_id=user.id,
            phone=phone,
            whatsapp_number=whatsapp_number
        )
        db.session.add(caregiver)
        db.session.commit()

    # Log Audit Event
    log_audit(
        user_id=user.id,
        action="USER_REGISTER",
        entity_type="User",
        entity_id=user.id,
        metadata={"role": role, "email": email}
    )

    # Generate JWT Tokens
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    user_dict = user.to_dict()
    if user.caregiver_profile:
        user_dict['caregiver_profile'] = user.caregiver_profile.to_dict()

    return {
        "user": user_dict,
        "access_token": access_token,
        "refresh_token": refresh_token
    }


def authenticate_user(email, password):
    """
    Authenticates user with email and password.
    Returns user payload and JWT tokens upon success.
    """
    email = (email or '').strip().lower()
    if not email or not password:
        raise ValidationError("Email and password are required")

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        raise UnauthorizedError("Invalid email or password")

    if not user.is_active:
        raise UnauthorizedError("User account is inactive. Please contact support.")

    # Generate Tokens
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    # Log Audit Event
    log_audit(
        user_id=user.id,
        action="USER_LOGIN",
        entity_type="User",
        entity_id=user.id,
        metadata={"email": email}
    )

    user_dict = user.to_dict()
    if user.caregiver_profile:
        user_dict['caregiver_profile'] = user.caregiver_profile.to_dict()

    return {
        "user": user_dict,
        "access_token": access_token,
        "refresh_token": refresh_token
    }


def refresh_user_token(user_id):
    """
    Generates a new access token using a valid refresh token.
    """
    user = User.query.get(user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User is inactive or non-existent")

    new_access_token = create_access_token(identity=str(user.id))

    log_audit(
        user_id=user.id,
        action="TOKEN_REFRESH",
        entity_type="User",
        entity_id=user.id
    )

    return {"access_token": new_access_token}


def get_user_profile(user_id):
    """
    Retrieves currently authenticated user profile without exposing password hashes.
    """
    user = User.query.get(user_id)
    if not user:
        raise NotFoundError("User profile not found")

    user_dict = user.to_dict()
    if user.caregiver_profile:
        user_dict['caregiver_profile'] = user.caregiver_profile.to_dict()
        # Attached assigned patients
        assigned_patients = [p.to_dict() for p in user.caregiver_profile.assigned_patients]
        user_dict['caregiver_profile']['assigned_patients'] = assigned_patients

    return user_dict
