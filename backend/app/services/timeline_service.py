from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.models.timeline import TimelineEvent, VerificationStatus
from app.models.user import User
from app.repositories import timeline_repository
from app.services.audit_service import log_action


async def confirm_event(db: Session, *, event: TimelineEvent, officer: User, notes: str | None) -> TimelineEvent:
    """
    The human gate for an AI-extracted timeline event (PDF §2/§3.2). Only this
    function may move an event from AI_EXTRACTED_UNVERIFIED to VERIFIED — the
    extraction service itself never sets a verified status.
    """
    event.verification_status = VerificationStatus.VERIFIED
    event.confirmed_by = officer.id
    event.confirmed_at = datetime.now(timezone.utc)
    event = timeline_repository.update(db, event)

    log_action(
        db, actor=officer, action="timeline.confirm", target_type="timeline_event",
        target_id=str(event.id), case_id=event.case_id, metadata={"notes": notes} if notes else None,
    )

    await manager.broadcast(
        event.case_id,
        {
            "type": "timeline.event_confirmed",
            "event_id": str(event.id),
            "confirmed_by": officer.full_name,
        },
    )
    return event
