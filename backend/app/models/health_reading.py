from app.extensions import db
from app.models.base import UUIDMixin, GUID, utc_now

class HealthReading(db.Model, UUIDMixin):
    __tablename__ = 'health_readings'
    __table_args__ = (
        db.Index('idx_health_patient_timestamp', 'patient_id', 'timestamp'),
    )

    patient_id = db.Column(GUID(), db.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    device_id = db.Column(GUID(), db.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False, index=True)

    timestamp = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    heart_rate = db.Column(db.Float, nullable=False)
    spo2 = db.Column(db.Float, nullable=False)
    temperature = db.Column(db.Float, nullable=False)
    battery_percentage = db.Column(db.Float, nullable=False, default=100.0)
    wifi_status = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'device_id': str(self.device_id),
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'heart_rate': self.heart_rate,
            'spo2': self.spo2,
            'temperature': self.temperature,
            'battery_percentage': self.battery_percentage,
            'wifi_status': self.wifi_status,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
