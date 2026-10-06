from app.extensions import db
from app.models.base import UUIDMixin, GUID, utc_now

class Alert(db.Model, UUIDMixin):
    __tablename__ = 'alerts'

    patient_id = db.Column(GUID(), db.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    blink_event_id = db.Column(GUID(), db.ForeignKey('blink_events.id', ondelete='SET NULL'), nullable=True, index=True)
    alert_type = db.Column(db.String(50), nullable=False) # BLINK_REQUEST, VITAL_ANOMALY, EMERGENCY_SOS
    severity = db.Column(db.String(20), nullable=False, default='MEDIUM') # LOW, MEDIUM, HIGH, CRITICAL
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='PENDING') # PENDING, ACKNOWLEDGED, RESOLVED
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    acknowledged_at = db.Column(db.DateTime(timezone=True), nullable=True)
    acknowledged_by = db.Column(GUID(), db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)


    # Relationships
    notification_logs = db.relationship('NotificationLog', backref='alert', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'blink_event_id': str(self.blink_event_id) if self.blink_event_id else None,
            'alert_type': self.alert_type,
            'severity': self.severity,
            'message': self.message,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'acknowledged_by': str(self.acknowledged_by) if self.acknowledged_by else None
        }
