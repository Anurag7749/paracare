from app.extensions import db
from app.models.base import UUIDMixin, TimestampMixin

class User(db.Model, UUIDMixin, TimestampMixin):
    __tablename__ = 'users'

    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='CAREGIVER') # ADMIN, CAREGIVER
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    # Relationships
    caregiver_profile = db.relationship('Caregiver', backref='user', uselist=False, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
