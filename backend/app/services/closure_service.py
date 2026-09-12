"""
Case Closure Readiness Score. Deterministic arithmetic, not AI — the score is
a transparent function of how many items still need human attention, so an
officer can always see exactly which unresolved counts are dragging the
score down. Never represented as a legal judgment (build prompt).
"""
import uuid

from sqlalchemy.orm import Session

from app.models.analysis import ClosureReadinessScore
from app.models.timeline import VerificationStatus
from app.repositories import (
    closure_repository,
    contradiction_repository,
    guidance_repository,
    timeline_repository,
)
from app.services import evidence_service


def compute_score_for_case(db: Session, case_id: uuid.UUID) -> ClosureReadinessScore:
    timeline_events = timeline_repository.list_for_case(db, case_id)
    contradictions = contradiction_repository.list_for_case(db, case_id)
    guidance_items = guidance_repository.list_for_case(db, case_id)
    chain_valid, _, evidence_count = evidence_service.verify_case_chain(db, case_id)

    unverified_events = sum(
        1 for e in timeline_events if e.verification_status == VerificationStatus.AI_EXTRACTED_UNVERIFIED
    )
    open_contradictions = sum(1 for c in contradictions if c.status == VerificationStatus.REQUIRES_REVIEW)
    pending_guidance = sum(1 for g in guidance_items if g.status == VerificationStatus.REQUIRES_REVIEW)

    # Start at 100, subtract a fixed penalty per unresolved item, floor at 0.
    # Weights are intentionally simple/explainable rather than tuned — this
    # is a readiness signal for the officer, not a scored legal test.
    # Penalties are proportional and capped, so a case the AI has read
    # thoroughly (dozens of extracted, not-yet-confirmed events) is not
    # scored as hopeless. What matters for filing is the SHARE of the
    # timeline still unverified, and whether conflicts remain open.
    total_events = max(len(timeline_events), 1)
    unverified_share = unverified_events / total_events
    score = 100.0
    score -= 40 * unverified_share                          # up to 40 points: unverified timeline
    score -= min(30.0, open_contradictions * 8)             # up to 30 points: open contradictions
    score -= min(15.0, pending_guidance * 1.5)              # up to 15 points: unanswered procedural steps
    if not chain_valid:
        score -= 40  # a broken hash chain is a serious integrity problem, weighted heavily
    score = max(0.0, min(100.0, score))

    record = ClosureReadinessScore(
        case_id=case_id,
        score=round(score, 2),
        factors={
            "evidence_count": evidence_count,
            "unverified_timeline_events": unverified_events,
            "open_contradictions": open_contradictions,
            "pending_guidance_items": pending_guidance,
            "hash_chain_valid": chain_valid,
            "unverified_share": round(unverified_share, 3),
            "method": (
                "deterministic: 100 - 40*(unverified share of timeline) - min(30, 8*open_contradictions) "
                "- min(15, 1.5*pending_guidance) - 40*(chain broken)"
            ),
        },
    )
    return closure_repository.create(db, record)
