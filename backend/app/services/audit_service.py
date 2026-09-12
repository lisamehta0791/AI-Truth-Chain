import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User


def log_action(
    db: Session,
    *,
    actor: User | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    case_id: uuid.UUID | None = None,
    metadata: dict | None = None,
    result: str = "success",
) -> AuditLog:
    """
    The single choke point every other service calls to record an audit event.
    Never bypassed — services must not write to evidence, contradictions, etc.
    without also calling this. Commits immediately so an audit row survives even
    if the calling transaction later rolls back.
    """
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        role=actor.role.value if actor else "system",
        action=action,
        target_type=target_type,
        target_id=target_id,
        case_id=case_id,
        metadata_json=metadata,
        result=result,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
