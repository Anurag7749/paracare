"""
ParaCare Mock Notification Service

Provides pluggable mock notification dispatchers for development.
In production, these would be replaced with real Twilio (SMS/WhatsApp)
and SendGrid/SMTP (Email) integrations.

Channels: WHATSAPP, SMS, EMAIL, SYSTEM
"""

from datetime import datetime, timezone
from app.extensions import db
from app.models import NotificationLog

def _log_notification(alert_id, channel, recipient, message, status="SENT", error_message=None):
    """Persist a notification dispatch record to notification_logs table."""
    log = NotificationLog(
        alert_id=alert_id,
        channel=channel,
        recipient=recipient,
        message=message,
        status=status,
        error_message=error_message
    )
    db.session.add(log)
    db.session.commit()
    return log


def send_whatsapp(alert, recipient_phone, message):
    """
    Mock WhatsApp notification dispatcher.
    In production: Twilio WhatsApp Business API.
    """
    print(f"[MOCK WHATSAPP] To: {recipient_phone}")
    print(f"  Alert #{str(alert.id)[:8]} | Severity: {alert.severity}")
    print(f"  Message: {message}")
    print(f"  Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("  Status: SENT (mock)")

    return _log_notification(
        alert_id=alert.id,
        channel="WHATSAPP",
        recipient=recipient_phone,
        message=message,
        status="SENT"
    )


def send_sms(alert, recipient_phone, message):
    """
    Mock SMS notification dispatcher.
    In production: Twilio SMS API.
    """
    print(f"[MOCK SMS] To: {recipient_phone}")
    print(f"  Alert #{str(alert.id)[:8]} | Severity: {alert.severity}")
    print(f"  Message: {message}")
    print("  Status: SENT (mock)")

    return _log_notification(
        alert_id=alert.id,
        channel="SMS",
        recipient=recipient_phone,
        message=message,
        status="SENT"
    )


def send_email(alert, recipient_email, message):
    """
    Mock Email notification dispatcher.
    In production: SendGrid or SMTP.
    """
    print(f"[MOCK EMAIL] To: {recipient_email}")
    print(f"  Subject: ParaCare Alert - {alert.severity}")
    print(f"  Alert #{str(alert.id)[:8]} | Type: {alert.alert_type}")
    print(f"  Body: {message}")
    print("  Status: SENT (mock)")

    return _log_notification(
        alert_id=alert.id,
        channel="EMAIL",
        recipient=recipient_email,
        message=message,
        status="SENT"
    )


def dispatch_notifications(alert, caregivers):
    """
    Dispatch alert notifications to all assigned caregivers across all channels.

    Args:
        alert: Alert ORM object.
        caregivers: List of Caregiver ORM objects assigned to the patient.

    Returns:
        list: List of NotificationLog records created.
    """
    logs = []

    for caregiver in caregivers:
        # WhatsApp (if number available)
        if caregiver.whatsapp_number:
            log = send_whatsapp(alert, caregiver.whatsapp_number, alert.message)
            logs.append(log)

        # SMS
        if caregiver.phone:
            log = send_sms(alert, caregiver.phone, alert.message)
            logs.append(log)

        # Email (via user relationship)
        if caregiver.user and caregiver.user.email:
            log = send_email(alert, caregiver.user.email, alert.message)
            logs.append(log)

    # System notification log (always)
    system_log = _log_notification(
        alert_id=alert.id,
        channel="SYSTEM",
        recipient="dashboard",
        message=alert.message,
        status="DELIVERED"
    )
    logs.append(system_log)

    print(f"[NOTIFICATION] Dispatched {len(logs)} notifications for alert #{str(alert.id)[:8]}")
    return logs
