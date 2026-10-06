from functools import wraps
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from app.models import User, Caregiver, CaregiverPatient
from app.errors.exceptions import UnauthorizedError, ForbiddenError, NotFoundError

def get_current_user():
    """
    Fetches the currently authenticated User object based on the JWT identity.
    Must be called after verify_jwt_in_request() / inside a @jwt_required() route.
    """
    verify_jwt_in_request()
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("User account is inactive or not found")
    return user


def get_accessible_patient_ids(user):
    """
    Returns the list of patient_ids the given user is authorized to see.
    - ADMIN: None means "all patients" (caller should skip filtering).
    - CAREGIVER: list of assigned patient_ids (possibly empty).
    """
    if user.role == 'ADMIN':
        return None

    if user.role == 'CAREGIVER':
        if not user.caregiver_profile:
            return []
        assignments = CaregiverPatient.query.filter_by(
            caregiver_id=user.caregiver_profile.id
        ).all()
        return [a.patient_id for a in assignments]

    return []


def roles_required(*allowed_roles):
    """
    Decorator to enforce Role-Based Access Control (RBAC).
    Allowed roles: ADMIN, CAREGIVER
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user_id = get_jwt_identity()
            user = User.query.get(current_user_id)
            if not user or not user.is_active:
                raise UnauthorizedError("User account is inactive or not found")
            
            if user.role not in allowed_roles:
                raise ForbiddenError(f"Access denied. Required role: {', '.join(allowed_roles)}")
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def check_patient_access(user, patient_id):
    """
    Business logic helper to check if a user has access to a given patient.
    - ADMIN: Has access to ALL patients.
    - CAREGIVER: Has access ONLY to assigned patients in caregiver_patients table.
    """
    if not user or not user.is_active:
        raise UnauthorizedError("User is inactive or unauthorized")

    if user.role == 'ADMIN':
        return True

    if user.role == 'CAREGIVER':
        if not user.caregiver_profile:
            raise ForbiddenError("Caregiver profile not configured")
        
        # Query junction table for assignment
        is_assigned = CaregiverPatient.query.filter_by(
            caregiver_id=user.caregiver_profile.id,
            patient_id=patient_id
        ).first() is not None

        if not is_assigned:
            raise ForbiddenError("Access denied. Patient is not assigned to this caregiver.")
        return True

    raise ForbiddenError("Unauthorized role")
