import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def list_for_case(db: Session, case_id: uuid.UUID, limit: int = 200) -> list[AuditLog]:
    """
    Newest first, capped at `limit` — the Audit Trail page paginates client-side
    for now; a real cursor-based endpoint can replace this without changing
    the response shape once case audit volume grows past hackathon scale.
    """
    stmt = (
        select(AuditLog)
        .where(AuditLog.case_id == case_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))
