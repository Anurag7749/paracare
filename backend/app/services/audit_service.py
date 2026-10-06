from app.extensions import db
from app.models import AuditLog

def log_audit(user_id=None, action="", entity_type="", entity_id=None, metadata=None):
    """
    Utility service function to record system audit logs.
    """
    try:
        audit_entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            metadata_json=metadata or {}
        )
        db.session.add(audit_entry)
        db.session.commit()
        return audit_entry
    except Exception as e:
        db.session.rollback()
        print(f"Failed to log audit event [{action}]: {str(e)}")
        return None
