from app.extensions import db
from app.models.base import UUIDMixin, TimestampMixin

class Patient(db.Model, UUIDMixin, TimestampMixin):
    __tablename__ = 'patients'

    patient_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(20), nullable=True)
    condition = db.Column(db.Text, nullable=True)
    room_number = db.Column(db.String(20), nullable=True)

    # Relationships
    devices = db.relationship('Device', backref='patient', lazy='dynamic')
    health_readings = db.relationship('HealthReading', backref='patient', lazy='dynamic', cascade='all, delete-orphan')
    blink_events = db.relationship('BlinkEvent', backref='patient', lazy='dynamic', cascade='all, delete-orphan')
    alerts = db.relationship('Alert', backref='patient', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': str(self.id),
            'patient_code': self.patient_code,
            'name': self.name,
            'age': self.age,
            'gender': self.gender,
            'condition': self.condition,
            'room_number': self.room_number,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
