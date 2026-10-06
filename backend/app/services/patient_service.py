"""
Patient management service.
"""
from app.extensions import db
from app.models import Patient
from app.errors.exceptions import ValidationError, NotFoundError
from app.services.audit_service import log_audit


def get_patients(page=1, per_page=20, search=None, patient_ids=None):
    """
    List patients with optional search and pagination.
    patient_ids: if provided (a list), restricts results to only those
    patient ids - used to scope CAREGIVER users to their assigned patients.
    An empty list means "no accessible patients" and returns an empty page.
    None means "no restriction" (used for ADMIN users).
    """
    if patient_ids is not None and len(patient_ids) == 0:
        return {
            "items": [],
            "pagination": {"page": page, "per_page": per_page, "total": 0, "pages": 0}
        }

    query = Patient.query
    if patient_ids is not None:
        query = query.filter(Patient.id.in_(patient_ids))
    if search:
        query = query.filter(
            db.or_(
                Patient.name.ilike(f"%{search}%"),
                Patient.patient_code.ilike(f"%{search}%"),
                Patient.room_number.ilike(f"%{search}%")
            )
        )
    query = query.order_by(Patient.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return {
        "items": [p.to_dict() for p in pagination.items],
        "pagination": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages
        }
    }


def get_patient_by_id(patient_id):
    """Get single patient with device info."""
    patient = Patient.query.get(patient_id)
    if not patient:
        raise NotFoundError(f"Patient not found: {patient_id}")
    result = patient.to_dict()
    result["devices"] = [d.to_dict() for d in patient.devices.all()]
    return result


def create_patient(data, user_id=None):
    """Create a new patient."""
    name = data.get('name', '').strip()
    patient_code = data.get('patient_code', '').strip()
    age = data.get('age')
    
    if not name or not patient_code or not age:
        raise ValidationError("name, patient_code, and age are required")
    
    if Patient.query.filter_by(patient_code=patient_code).first():
        raise ValidationError(f"Patient code '{patient_code}' already exists")
    
    patient = Patient(
        patient_code=patient_code,
        name=name,
        age=int(age),
        gender=data.get('gender'),
        condition=data.get('condition'),
        room_number=data.get('room_number')
    )
    db.session.add(patient)
    db.session.commit()
    
    log_audit(user_id=user_id, action="CREATE_PATIENT", entity_type="Patient", entity_id=patient.id)
    return patient.to_dict()


def update_patient(patient_id, data, user_id=None):
    """Update a patient."""
    patient = Patient.query.get(patient_id)
    if not patient:
        raise NotFoundError(f"Patient not found: {patient_id}")
    
    if 'name' in data:
        patient.name = data['name'].strip()
    if 'age' in data:
        patient.age = int(data['age'])
    if 'gender' in data:
        patient.gender = data['gender']
    if 'condition' in data:
        patient.condition = data['condition']
    if 'room_number' in data:
        patient.room_number = data['room_number']
    
    db.session.commit()
    log_audit(user_id=user_id, action="UPDATE_PATIENT", entity_type="Patient", entity_id=patient.id)
    return patient.to_dict()
