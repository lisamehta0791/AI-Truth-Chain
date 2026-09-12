import asyncio
import uuid

from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.models.contradiction import GuidanceSuggestion
from app.models.timeline import VerificationStatus
from app.models.user import User
from app.repositories import guidance_repository
from app.services.ai import guidance as ai_guidance
from app.services.audit_service import log_action


async def generate_for_evidence(
    db: Session,
    *,
    case_id: uuid.UUID,
    evidence_id: uuid.UUID | None,
    situation_text: str,
) -> GuidanceSuggestion | None:
    """
    Called by evidence_service right after contradiction detection, using the
    same newly-extracted event text as the "situation." Never a legal
    authority (PDF §3.4) — always persisted as REQUIRES_REVIEW for an officer
    to explicitly acknowledge.
    """
    result = await asyncio.to_thread(
        ai_guidance.generate_guidance_suggestion, db, case_id=case_id, situation_text=situation_text
    )
    if result is None:
        return None

    suggestion = GuidanceSuggestion(
        case_id=case_id,
        triggered_by_evidence_id=evidence_id,
        suggestion=result["suggestion"],
        legal_reference=result["legal_reference"],
        confidence=result.get("confidence", 0.5),
        status=VerificationStatus.REQUIRES_REVIEW,
    )
    suggestion = guidance_repository.create(db, suggestion)

    await manager.broadcast(
        case_id,
        {
            "type": "guidance.suggested",
            "guidance_id": str(suggestion.id),
            "suggestion": suggestion.suggestion,
            "legal_reference": suggestion.legal_reference,
            "confidence": float(suggestion.confidence),
        },
    )
    return suggestion


async def acknowledge(db: Session, *, suggestion: GuidanceSuggestion, officer: User, notes: str | None) -> GuidanceSuggestion:
    return await _review(db, suggestion=suggestion, officer=officer, notes=notes, outcome=VerificationStatus.HUMAN_CONFIRMED)


async def dismiss(db: Session, *, suggestion: GuidanceSuggestion, officer: User, notes: str | None) -> GuidanceSuggestion:
    return await _review(db, suggestion=suggestion, officer=officer, notes=notes, outcome=VerificationStatus.DISMISSED)


async def _review(
    db: Session,
    *,
    suggestion: GuidanceSuggestion,
    officer: User,
    notes: str | None,
    outcome: VerificationStatus,
) -> GuidanceSuggestion:
    suggestion.status = outcome
    suggestion = guidance_repository.update(db, suggestion)

    log_action(
        db, actor=officer, action=f"guidance.{outcome.value}", target_type="guidance_suggestion",
        target_id=str(suggestion.id), case_id=suggestion.case_id,
        metadata={"notes": notes} if notes else None,
    )

    await manager.broadcast(
        suggestion.case_id,
        {"type": "guidance.reviewed", "guidance_id": str(suggestion.id), "outcome": outcome.value},
    )
    return suggestion
