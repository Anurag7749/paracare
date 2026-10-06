from datetime import datetime, timezone
from app.extensions import db
from app.models.base import UUIDMixin, TimestampMixin, GUID, utc_now

class CaregiverPatient(db.Model, UUIDMixin):
    __tablename__ = 'caregiver_patients'
    __table_args__ = (
        db.UniqueConstraint('caregiver_id', 'patient_id', name='uq_caregiver_patient'),
    )

    caregiver_id = db.Column(GUID(), db.ForeignKey('caregivers.id', ondelete='CASCADE'), nullable=False, index=True)
    patient_id = db.Column(GUID(), db.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    assigned_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            'id': str(self.id),
            'caregiver_id': str(self.caregiver_id),
            'patient_id': str(self.patient_id),
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None
        }


class Caregiver(db.Model, UUIDMixin, TimestampMixin):
    __tablename__ = 'caregivers'

    user_id = db.Column(GUID(), db.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(30), nullable=False)
    whatsapp_number = db.Column(db.String(30), nullable=True)


    # Relationships
    assigned_patients = db.relationship('Patient', secondary='caregiver_patients', backref=db.backref('caregivers', lazy='dynamic'))

    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': str(self.user_id),
            'phone': self.phone,
            'whatsapp_number': self.whatsapp_number,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
