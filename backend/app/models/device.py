from app.extensions import db
from app.models.base import UUIDMixin, TimestampMixin, GUID

class Device(db.Model, UUIDMixin, TimestampMixin):
    __tablename__ = 'devices'

    device_id = db.Column(db.String(50), unique=True, nullable=False, index=True)
    patient_id = db.Column(GUID(), db.ForeignKey('patients.id', ondelete='SET NULL'), nullable=True, index=True)

    device_name = db.Column(db.String(100), nullable=False, default='Smart Glasses ESP32')
    battery_percentage = db.Column(db.Float, nullable=False, default=100.0)
    wifi_status = db.Column(db.String(50), nullable=True, default='CONNECTED')
    last_seen = db.Column(db.DateTime(timezone=True), nullable=True)
    is_online = db.Column(db.Boolean, nullable=False, default=False)
    # Hashed device credential used to authenticate incoming ESP32/simulator
    # requests (POST /api/device/data, /api/device/heartbeat). The plaintext
    # key is only ever shown once (at seed/creation time) and must be
    # configured into the firmware / simulator - it is never stored in
    # plaintext or logged. NULL is only tolerated in local development when
    # DEVICE_AUTH_REQUIRED=false; production configs must always set this.
    api_key_hash = db.Column(db.String(255), nullable=True)

    # Relationships
    health_readings = db.relationship('HealthReading', backref='device', lazy='dynamic', cascade='all, delete-orphan')
    blink_events = db.relationship('BlinkEvent', backref='device', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': str(self.id),
            'device_id': self.device_id,
            'patient_id': str(self.patient_id) if self.patient_id else None,
            'device_name': self.device_name,
            'battery_percentage': self.battery_percentage,
            'wifi_status': self.wifi_status,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'is_online': self.is_online,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
            # api_key_hash is intentionally never exposed via to_dict()
        }
