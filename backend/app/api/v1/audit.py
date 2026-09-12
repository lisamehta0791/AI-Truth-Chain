import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.db.session import get_db
from app.models.user import User
from app.repositories import audit_repository
from app.schemas.audit import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def list_audit_log(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditLogOut]:
    """
    Deliberately NOT itself audit-logged — logging every view of the audit
    log would recurse pointlessly. Open to every authenticated case member
    regardless of role: transparency into what happened to the evidence is
    exactly what this page exists for.
    """
    return audit_repository.list_for_case(db, case_id)
