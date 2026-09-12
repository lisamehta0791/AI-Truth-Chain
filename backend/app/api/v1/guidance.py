import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import guidance_repository
from app.schemas.guidance import GuidanceReviewRequest, GuidanceSuggestionOut
from app.services import guidance_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/guidance", tags=["guidance"])


@router.get("", response_model=list[GuidanceSuggestionOut])
def list_guidance(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GuidanceSuggestionOut]:
    items = guidance_repository.list_for_case(db, case_id)
    log_action(
        db, actor=current_user, action="guidance.list", target_type="case",
        target_id=str(case_id), case_id=case_id,
    )
    return items


def _get_or_404(db: Session, guidance_id: uuid.UUID):
    suggestion = guidance_repository.get_by_id(db, guidance_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Guidance suggestion not found")
    return suggestion


@router.post("/{guidance_id}/acknowledge", response_model=GuidanceSuggestionOut, dependencies=[Depends(require_writer)])
async def acknowledge_guidance(
    guidance_id: uuid.UUID,
    data: GuidanceReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GuidanceSuggestionOut:
    suggestion = _get_or_404(db, guidance_id)
    return await guidance_service.acknowledge(db, suggestion=suggestion, officer=current_user, notes=data.notes)


@router.post("/{guidance_id}/dismiss", response_model=GuidanceSuggestionOut, dependencies=[Depends(require_writer)])
async def dismiss_guidance(
    guidance_id: uuid.UUID,
    data: GuidanceReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GuidanceSuggestionOut:
    suggestion = _get_or_404(db, guidance_id)
    return await guidance_service.dismiss(db, suggestion=suggestion, officer=current_user, notes=data.notes)
