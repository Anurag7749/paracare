from app.extensions import db
from app.models.base import UUIDMixin, GUID, utc_now

class NotificationLog(db.Model, UUIDMixin):
    __tablename__ = 'notification_logs'

    alert_id = db.Column(GUID(), db.ForeignKey('alerts.id', ondelete='CASCADE'), nullable=False, index=True)

    channel = db.Column(db.String(30), nullable=False) # WHATSAPP, SMS, EMAIL, SYSTEM
    recipient = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(30), nullable=False, default='SENT') # SENT, DELIVERED, FAILED
    sent_at = db.Column(db.DateTime(timezone=True), default=utc_now, nullable=False)
    error_message = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': str(self.id),
            'alert_id': str(self.alert_id),
            'channel': self.channel,
            'recipient': self.recipient,
            'message': self.message,
            'status': self.status,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'error_message': self.error_message
        }
