from app.services.health_service import check_system_health
from app.services.auth_service import (
    register_user, authenticate_user, refresh_user_token, get_user_profile
)
from app.services.audit_service import log_audit
from app.services.device_service import process_device_data, process_device_heartbeat
from app.services.blink_service import (
    classify_blink, validate_blink_command, normalize_blink_data, process_blink_event,
    BLINK_COUNT_COMMAND_MAP, COMMAND_SEVERITY_MAP, VALID_COMMANDS,
    BLINK_WINDOW_SECONDS, SOS_HOLD_SECONDS, MAX_COMMAND_BLINKS, MAX_BLINK_COUNT
)
from app.services.alert_service import (
    create_alert_from_blink, get_alerts, get_alert_by_id,
    acknowledge_alert, resolve_alert
)
from app.services.notification_service import dispatch_notifications

__all__ = [
    'check_system_health',
    'register_user',
    'authenticate_user',
    'refresh_user_token',
    'get_user_profile',
    'log_audit',
    'process_device_data',
    'process_device_heartbeat',
    'classify_blink',
    'validate_blink_command',
    'normalize_blink_data',
    'process_blink_event',
    'create_alert_from_blink',
    'get_alerts',
    'get_alert_by_id',
    'acknowledge_alert',
    'resolve_alert',
    'dispatch_notifications',
]

