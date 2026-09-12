import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, verified_case_id
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import timeline_repository
from app.schemas.timeline import TimelineConfirmRequest, TimelineEventOut
from app.services import timeline_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("", response_model=list[TimelineEventOut])
def list_timeline(
    case_id: uuid.UUID = Depends(verified_case_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TimelineEventOut]:
    events = timeline_repository.list_for_case(db, case_id)
    log_action(
        db, actor=current_user, action="timeline.view", target_type="case",
        target_id=str(case_id), case_id=case_id,
    )
    return events


@router.post("/{event_id}/confirm", response_model=TimelineEventOut, dependencies=[Depends(require_writer)])
async def confirm_timeline_event(
    event_id: uuid.UUID,
    data: TimelineConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimelineEventOut:
    event = timeline_repository.get_by_id(db, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Timeline event not found")

    return await timeline_service.confirm_event(db, event=event, officer=current_user, notes=data.notes)
