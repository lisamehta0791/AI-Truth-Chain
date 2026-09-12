import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import contradiction_repository
from app.schemas.contradiction import ContradictionOut, ContradictionReviewRequest
from app.services import contradiction_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/contradictions", tags=["contradictions"])


@router.get("", response_model=list[ContradictionOut])
def list_contradictions(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ContradictionOut]:
    items = contradiction_repository.list_for_case(db, case_id)
    log_action(
        db, actor=current_user, action="contradiction.list", target_type="case",
        target_id=str(case_id), case_id=case_id,
    )
    return items


def _get_or_404(db: Session, contradiction_id: uuid.UUID):
    contradiction = contradiction_repository.get_by_id(db, contradiction_id)
    if contradiction is None:
        raise HTTPException(status_code=404, detail="Contradiction not found")
    return contradiction


@router.post("/{contradiction_id}/confirm", response_model=ContradictionOut, dependencies=[Depends(require_writer)])
async def confirm_contradiction(
    contradiction_id: uuid.UUID,
    data: ContradictionReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContradictionOut:
    contradiction = _get_or_404(db, contradiction_id)
    return await contradiction_service.confirm(db, contradiction=contradiction, officer=current_user, notes=data.notes)


@router.post("/{contradiction_id}/dismiss", response_model=ContradictionOut, dependencies=[Depends(require_writer)])
async def dismiss_contradiction(
    contradiction_id: uuid.UUID,
    data: ContradictionReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContradictionOut:
    contradiction = _get_or_404(db, contradiction_id)
    return await contradiction_service.dismiss(db, contradiction=contradiction, officer=current_user, notes=data.notes)


@router.post("/{contradiction_id}/request-review", response_model=ContradictionOut, dependencies=[Depends(require_writer)])
async def request_review_contradiction(
    contradiction_id: uuid.UUID,
    data: ContradictionReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ContradictionOut:
    contradiction = _get_or_404(db, contradiction_id)
    return await contradiction_service.request_review(db, contradiction=contradiction, officer=current_user, notes=data.notes)
