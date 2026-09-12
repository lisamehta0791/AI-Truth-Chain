import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.models.contradiction import Contradiction, Severity
from app.models.timeline import VerificationStatus
from app.models.user import User
from app.repositories import contradiction_repository
from app.services.ai import contradiction as ai_contradiction
from app.services.audit_service import log_action


async def run_contradiction_check(
    db: Session,
    *,
    case_id: uuid.UUID,
    new_evidence_id: uuid.UUID,
    new_event_description: str,
) -> list[Contradiction]:
    """
    Called by evidence_service right after extraction. Never auto-resolves
    anything — every result is persisted with status=REQUIRES_REVIEW and
    broadcast live so the officer sees it appear on screen during the demo.
    """
    raw_results = await asyncio.to_thread(
        ai_contradiction.detect_contradictions,
        db,
        case_id=case_id,
        new_event_description=new_event_description,
        new_event_source_id=str(new_evidence_id),
    )

    created: list[Contradiction] = []
    for result in raw_results:
        conflicting_evidence_id_str = result.get("conflicting_source_id")
        try:
            conflicting_evidence_id = uuid.UUID(conflicting_evidence_id_str)
        except (TypeError, ValueError):
            continue  # skip malformed model output rather than crash the pipeline

        contradiction = Contradiction(
            case_id=case_id,
            evidence_a_id=new_evidence_id,
            evidence_b_id=conflicting_evidence_id,
            severity=Severity(result.get("severity", "minor")),
            confidence=result.get("confidence", 0.5),
            explanation=result.get("explanation", ""),
            status=VerificationStatus.REQUIRES_REVIEW,
        )
        contradiction = contradiction_repository.create(db, contradiction)
        created.append(contradiction)

        await manager.broadcast(
            case_id,
            {
                "type": "contradiction.flagged",
                "contradiction_id": str(contradiction.id),
                "severity": contradiction.severity.value,
                "confidence": float(contradiction.confidence),
                "explanation": contradiction.explanation,
            },
        )

    return created


async def confirm(db: Session, *, contradiction: Contradiction, officer: User, notes: str | None) -> Contradiction:
    return await _review(db, contradiction=contradiction, officer=officer, notes=notes, outcome=VerificationStatus.HUMAN_CONFIRMED)


async def dismiss(db: Session, *, contradiction: Contradiction, officer: User, notes: str | None) -> Contradiction:
    return await _review(db, contradiction=contradiction, officer=officer, notes=notes, outcome=VerificationStatus.DISMISSED)


async def request_review(db: Session, *, contradiction: Contradiction, officer: User, notes: str | None) -> Contradiction:
    return await _review(db, contradiction=contradiction, officer=officer, notes=notes, outcome=VerificationStatus.REQUIRES_REVIEW)


async def _review(
    db: Session,
    *,
    contradiction: Contradiction,
    officer: User,
    notes: str | None,
    outcome: VerificationStatus,
) -> Contradiction:
    """
    Single choke point for all three review actions. Confirming OR dismissing
    both permanently log the officer's decision (PDF §3.3) — dismissing a
    contradiction never deletes it, only marks it DISMISSED.
    """
    contradiction.status = outcome
    contradiction.reviewed_by = officer.id
    contradiction.reviewed_at = datetime.now(timezone.utc)
    contradiction = contradiction_repository.update(db, contradiction)

    log_action(
        db, actor=officer, action=f"contradiction.{outcome.value}", target_type="contradiction",
        target_id=str(contradiction.id), case_id=contradiction.case_id,
        metadata={"notes": notes} if notes else None,
    )

    await manager.broadcast(
        contradiction.case_id,
        {
            "type": "contradiction.reviewed",
            "contradiction_id": str(contradiction.id),
            "outcome": outcome.value,
            "reviewed_by": officer.full_name,
        },
    )
    return contradiction
