import enum
from app.extensions import db
from app.models.base import UUIDMixin, GUID, utc_now

class SourceEnum(str, enum.Enum):
    CAMERA = "CAMERA"
    ESP32 = "ESP32"
    IOT_GLASSES = "IOT_GLASSES"
    SIMULATOR = "SIMULATOR"

class CommandEnum(str, enum.Enum):
    NORMAL_BLINK = "NORMAL_BLINK"
    NEED_WATER = "NEED_WATER"
    NEED_FOOD = "NEED_FOOD"
    NEED_MEDICINE = "NEED_MEDICINE"
    EMERGENCY = "EMERGENCY"

class SeverityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class BlinkEvent(db.Model, UUIDMixin):
    __tablename__ = 'blink_events'
    __table_args__ = (
        db.Index('idx_blink_patient_timestamp', 'patient_id', 'timestamp'),
    )

    patient_id = db.Column(GUID(), db.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    device_id = db.Column(GUID(), db.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False, index=True)
    timestamp = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    blink_count = db.Column(db.Integer, nullable=False, default=1)
    duration_seconds = db.Column(db.Float, nullable=False, default=0.0)
    command = db.Column(db.String(30), nullable=False, default=CommandEnum.NORMAL_BLINK.value)
    severity = db.Column(db.String(20), nullable=False, default=SeverityEnum.LOW.value)
    source = db.Column(db.String(20), nullable=False, default=SourceEnum.ESP32.value)
    created_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)


    # Relationships
    alerts = db.relationship('Alert', backref='blink_event', lazy='dynamic')

    def to_dict(self):
        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'device_id': str(self.device_id),
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'blink_count': self.blink_count,
            'duration_seconds': self.duration_seconds,
            'command': self.command,
            'severity': self.severity,
            'source': self.source,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
