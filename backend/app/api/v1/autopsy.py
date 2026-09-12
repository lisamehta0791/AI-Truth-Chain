import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import autopsy_repository
from app.schemas.autopsy import AutopsyFindingOut, AutopsyReviewRequest
from app.services import autopsy_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/autopsy", tags=["autopsy"])


@router.get("", response_model=list[AutopsyFindingOut])
def list_autopsy_findings(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AutopsyFindingOut]:
    items = autopsy_repository.list_for_case(db, case_id)
    log_action(
        db, actor=current_user, action="autopsy.list", target_type="case",
        target_id=str(case_id), case_id=case_id,
    )
    return items


def _get_or_404(db: Session, finding_id: uuid.UUID):
    finding = autopsy_repository.get_by_id(db, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Autopsy finding not found")
    return finding


@router.post("/{finding_id}/confirm", response_model=AutopsyFindingOut, dependencies=[Depends(require_writer)])
async def confirm_autopsy_finding(
    finding_id: uuid.UUID,
    data: AutopsyReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutopsyFindingOut:
    finding = _get_or_404(db, finding_id)
    return await autopsy_service.confirm(db, finding=finding, reviewer=current_user, notes=data.notes)


@router.post("/{finding_id}/dismiss", response_model=AutopsyFindingOut, dependencies=[Depends(require_writer)])
async def dismiss_autopsy_finding(
    finding_id: uuid.UUID,
    data: AutopsyReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutopsyFindingOut:
    finding = _get_or_404(db, finding_id)
    return await autopsy_service.dismiss(db, finding=finding, reviewer=current_user, notes=data.notes)
