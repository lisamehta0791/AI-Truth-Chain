import asyncio
import uuid

from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.models.analysis import AutopsyFinding
from app.models.timeline import VerificationStatus
from app.models.user import User
from app.repositories import autopsy_repository
from app.services.ai import autopsy as ai_autopsy
from app.services.audit_service import log_action

MANDATORY_REVIEW_DISCLAIMER = "AI-generated investigative hypothesis — requires forensic medical officer review."


async def run_cross_check(
    db: Session, *, case_id: uuid.UUID, source_evidence_id: uuid.UUID, autopsy_text: str
) -> list[AutopsyFinding]:
    raw_findings = await asyncio.to_thread(
        ai_autopsy.cross_check_autopsy_text, db, case_id=case_id, autopsy_text=autopsy_text
    )

    created: list[AutopsyFinding] = []
    for raw in raw_findings:
        hypothesis_text = raw.get("ai_hypothesis", "").strip()
        if not hypothesis_text:
            continue
        if MANDATORY_REVIEW_DISCLAIMER not in hypothesis_text:
            hypothesis_text = f"{hypothesis_text} {MANDATORY_REVIEW_DISCLAIMER}"

        finding = AutopsyFinding(
            case_id=case_id,
            source_evidence_id=source_evidence_id,
            finding_type=raw.get("finding_type", "unspecified"),
            body_region=raw.get("body_region"),
            ai_hypothesis=hypothesis_text,
            confidence=raw.get("confidence", 0.5),
            requires_review=True,
            status=VerificationStatus.AI_HYPOTHESIS,
        )
        finding = autopsy_repository.create(db, finding)
        created.append(finding)

        await manager.broadcast(
            case_id,
            {
                "type": "autopsy.finding_added",
                "finding_id": str(finding.id),
                "finding_type": finding.finding_type,
                "body_region": finding.body_region,
                "confidence": float(finding.confidence),
            },
        )

    return created


async def confirm(db: Session, *, finding: AutopsyFinding, reviewer: User, notes: str | None) -> AutopsyFinding:
    return await _review(db, finding=finding, reviewer=reviewer, notes=notes, outcome=VerificationStatus.HUMAN_CONFIRMED)


async def dismiss(db: Session, *, finding: AutopsyFinding, reviewer: User, notes: str | None) -> AutopsyFinding:
    return await _review(db, finding=finding, reviewer=reviewer, notes=notes, outcome=VerificationStatus.DISMISSED)


async def _review(
    db: Session, *, finding: AutopsyFinding, reviewer: User, notes: str | None, outcome: VerificationStatus
) -> AutopsyFinding:
    finding.status = outcome
    finding = autopsy_repository.update(db, finding)

    log_action(
        db, actor=reviewer, action=f"autopsy.{outcome.value}", target_type="autopsy_finding",
        target_id=str(finding.id), case_id=finding.case_id, metadata={"notes": notes} if notes else None,
    )

    await manager.broadcast(
        finding.case_id,
        {"type": "autopsy.reviewed", "finding_id": str(finding.id), "outcome": outcome.value},
    )
    return finding
