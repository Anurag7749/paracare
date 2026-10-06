"""
Caregiver management service.
"""
from app.extensions import db
from app.models import Caregiver, CaregiverPatient, User, Patient
from app.errors.exceptions import NotFoundError, ValidationError
from app.services.audit_service import log_audit


def get_caregivers(page=1, per_page=20):
    """List caregivers with user info and assigned patient count."""
    query = Caregiver.query
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    items = []
    for cg in pagination.items:
        cg_dict = cg.to_dict()
        user = User.query.get(cg.user_id)
        if user:
            cg_dict['user_name'] = user.name
            cg_dict['user_email'] = user.email
        assignments = CaregiverPatient.query.filter_by(caregiver_id=cg.id).all()
        cg_dict['patient_count'] = len(assignments)
        cg_dict['assigned_patients'] = []
        for a in assignments:
            p = Patient.query.get(a.patient_id)
            if p:
                cg_dict['assigned_patients'].append({
                    'id': str(p.id), 'name': p.name,
                    'patient_code': p.patient_code, 'room_number': p.room_number
                })
        items.append(cg_dict)
    return {
        "items": items,
        "pagination": {
            "page": pagination.page, "per_page": pagination.per_page,
            "total": pagination.total, "pages": pagination.pages
        }
    }


def assign_patient_to_caregiver(caregiver_id, patient_id, user_id=None):
    """Assign a patient to a caregiver."""
    cg = Caregiver.query.get(caregiver_id)
    if not cg:
        raise NotFoundError("Caregiver not found")
    patient = Patient.query.get(patient_id)
    if not patient:
        raise NotFoundError("Patient not found")
    existing = CaregiverPatient.query.filter_by(
        caregiver_id=caregiver_id, patient_id=patient_id
    ).first()
    if existing:
        raise ValidationError("Patient already assigned to this caregiver")
    assignment = CaregiverPatient(caregiver_id=caregiver_id, patient_id=patient_id)
    db.session.add(assignment)
    db.session.commit()
    log_audit(user_id=user_id, action="ASSIGN_PATIENT", entity_type="CaregiverPatient",
              entity_id=str(assignment.id))
    return {"caregiver_id": str(caregiver_id), "patient_id": str(patient_id), "status": "assigned"}
