"""
Runs the Riverside Hotel scenario a stage at a time through the real
evidence pipeline, and can reset a case back to empty.

Progress is not stored in a side table: each demo item is tagged in its
`device_metadata` with the stage key it belongs to, so "which stages are
loaded" is derived from the evidence that actually exists. Reset therefore
never leaves a stale progress marker behind.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.demo.riverside import DRAFT_CHARGESHEET, RAMESH_V2, RELATED_CASES, STAGES, DemoItem, DemoStage, make_file_bytes, make_live_capture_bytes
from app.models.analysis import (
    AutopsyFinding,
    CaseSimilarityMatch,
    ChargesheetCheck,
    ClosureReadinessScore,
    LocationScore,
    StatementVersion,
)
from app.models.case import Case, CaseMember
from app.models.contradiction import Contradiction, GuidanceSuggestion
from app.models.evidence import ChainOfCustodyEvent, CustodyAction, Evidence
from app.models.graph import Entity, EntityRelationship
from app.models.ledger import ChainAnchor
from app.models.rag import OfflineSyncQueueEntry, RagChunk
from app.models.timeline import TimelineEvent
from app.models.user import User
from app.repositories import user_repository
from app.services import case_similarity_service, chargesheet_service, closure_service, evidence_service, ledger_service, location_service, statement_service, sync_service

logger = logging.getLogger(__name__)

DEMO_TAG = "demo_stage"


class ScenarioError(Exception):
    pass


# Followup-only stages (no evidence of their own) are recorded on the first
# evidence item's metadata, so progress is still derived from data that
# reset() removes — never from a side table that could go stale.
STAGE_MARK = "_demo_stages_done"


def _marker_evidence(db: Session, case_id: uuid.UUID) -> Evidence | None:
    return db.scalar(select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.uploaded_at).limit(1))


def loaded_stage_keys(db: Session, case_id: uuid.UUID) -> list[str]:
    rows = db.scalars(select(Evidence.device_metadata).where(Evidence.case_id == case_id)).all()
    keys = {(m or {}).get(DEMO_TAG) for m in rows}
    for m in rows:
        keys.update((m or {}).get(STAGE_MARK, []))
    return [s.key for s in STAGES if s.key in keys]


def _mark_stage_done(db: Session, case_id: uuid.UUID, key: str) -> None:
    ev = _marker_evidence(db, case_id)
    if ev is None:
        return
    meta = dict(ev.device_metadata or {})
    done = list(meta.get(STAGE_MARK, []))
    if key not in done:
        done.append(key)
    meta[STAGE_MARK] = done
    ev.device_metadata = meta
    db.add(ev)
    db.commit()


def describe(db: Session, case_id: uuid.UUID) -> dict:
    loaded = set(loaded_stage_keys(db, case_id))
    stages = [
        {
            "key": s.key,
            "title": s.title,
            "narration": s.narration,
            "item_count": len(s.items),
            "loaded": s.key in loaded,
        }
        for s in STAGES
    ]
    next_stage = next((s for s in STAGES if s.key not in loaded), None)
    case = db.get(Case, case_id)
    return {
        "case_id": str(case_id),
        "primary": bool(case and case.case_number == "COT-2026-0001"),
        "stages": stages,
        "loaded_count": len(loaded),
        "total": len(STAGES),
        "next_stage_key": next_stage.key if next_stage else None,
        "complete": next_stage is None,
    }


def _user_by_badge(db: Session, badge: str) -> User:
    user = db.scalar(select(User).where(User.badge_number == badge))
    if user is None:
        raise ScenarioError(
            f"Demo officer with badge {badge} is not seeded — run scripts/seed_demo_case.py first."
        )
    return user


async def _ingest_item(db: Session, case: Case, stage: DemoStage, item: DemoItem) -> Evidence:
    uploader = _user_by_badge(db, item.uploader_badge)
    witness = _user_by_badge(db, item.witness_badge) if item.witness_badge else None
    file_bytes, content_type = make_file_bytes(item)

    from app.core.permissions import requires_live_capture

    live_capture = make_live_capture_bytes(uploader.badge_number) if requires_live_capture(uploader) else None

    evidence = await evidence_service.ingest_evidence(
        db,
        case_id=case.id,
        evidence_type=item.evidence_type,
        file_bytes=file_bytes,
        original_filename=item.filename,
        content_type=content_type,
        uploader=uploader,
        witness_officer_id=witness.id if witness else None,
        device_metadata={DEMO_TAG: stage.key, "device_id": f"demo-{uploader.badge_number}"},
        captured_at=item.captured_at,
        gps_lat=item.gps[0] if item.gps else None,
        gps_lng=item.gps[1] if item.gps else None,
        description=item.description,
        language=item.language,
        extracted_text=item.text,
        live_capture_bytes=live_capture,
        live_capture_content_type="image/jpeg" if live_capture else None,
    )

    # Physical evidence waits for the second officer. In the scenario the
    # witness confirms straight away so the AI stages run — exactly what the
    # witness would do from their own login a few minutes later.
    if witness is not None:
        evidence = await evidence_service.confirm_witness(
            db, evidence=evidence, witness=witness, notes="Confirmed at collection (demo scenario)."
        )
    return evidence


async def load_next_stage(db: Session, case: Case) -> dict:
    loaded = set(loaded_stage_keys(db, case.id))
    stage = next((s for s in STAGES if s.key not in loaded), None)
    if stage is None:
        raise ScenarioError("Every stage of the scenario is already loaded. Reset to run it again.")

    created: list[str] = []
    for item in stage.items:
        evidence = await _ingest_item(db, case, stage, item)
        created.append(str(evidence.id))
    for action in [*IMPLICIT_FOLLOWUPS.get(stage.key, []), *stage.followups]:
        await _followup(db, case, action)
    if stage.followups and not stage.items:
        _mark_stage_done(db, case.id, stage.key)
    logger.info("Demo stage '%s' loaded for case %s (%d items)", stage.key, case.id, len(created))
    return {"stage": stage.key, "title": stage.title, "evidence_ids": created, **describe(db, case.id)}


# Non-evidence work that belongs with a stage's evidence rather than in its
# own stage: scoring the location surface once ANPR reads exist, writing the
# custody trail once exhibits go to the lab, anchoring the chain at pre-filing.
IMPLICIT_FOLLOWUPS: dict[str, list[str]] = {
    "movements": ["location_scores"],
    "forensics": ["custody_trail"],
    "prefiling": ["anchor"],
}


async def load_all(db: Session, case: Case) -> dict:
    result = describe(db, case.id)
    while not result["complete"]:
        result = await load_next_stage(db, case)
    return result


async def _followup(db: Session, case: Case, action: str) -> None:
    """Non-evidence steps. They call exactly the services the UI calls."""
    inspector = _user_by_badge(db, "INSP-3310")
    if action == "statement_v2":
        stmt = db.scalar(
            select(Evidence).where(Evidence.case_id == case.id, Evidence.description.ilike("Statement of Ramesh%")).limit(1)
        )
        if stmt is None:
            raise ScenarioError("The witness statement from stage 3 is missing - load the earlier stages first.")
        statement_service.add_version(db, evidence_id=stmt.id, text=stmt.extracted_text or "", language="en", actor=inspector)
        statement_service.add_version(db, evidence_id=stmt.id, text=RAMESH_V2, language="en", actor=inspector)
    elif action == "chargesheet_qa":
        await chargesheet_service.run_qa(db, case_id=case.id, chargesheet_text=DRAFT_CHARGESHEET)
    elif action == "closure_score":
        closure_service.compute_score_for_case(db, case.id)
    elif action == "offline_sync":
        import hashlib
        from datetime import datetime, timezone

        entries = []
        for i, note in enumerate(["Photo of service-lane drain grate, pre-recovery", "Photo of tool marks on rear door frame"]):
            ts = datetime(2025, 4, 15, 4, 40 + i * 3, tzinfo=timezone.utc)
            entries.append(
                {
                    "payload": {"type": "photo", "note": note, "device": "field-tablet-07"},
                    "original_timestamp": ts,
                    "original_hash": hashlib.sha256(f"{note}|{ts.isoformat()}".encode()).hexdigest(),
                }
            )
        sync_service.enqueue_batch(db, device_id="field-tablet-07", entries=entries)
    elif action == "location_scores":
        await location_service.compute_scores_for_case(db, case.id)
    elif action == "custody_trail":
        await _custody_trail(db, case)
    elif action == "anchor":
        sp = _user_by_badge(db, "SP-2201")
        if not db.scalar(select(ChainAnchor.id).where(ChainAnchor.case_id == case.id).limit(1)):
            ledger_service.anchor(db, case.id, by=sp, note="Anchored before filing (demo scenario)")
    elif action == "related_cases":
        await _related_cases(db, inspector)
    elif action == "similar_case":
        # Similarity compares named entities, which only exist once each
        # case's graph has been built — the graph is otherwise rebuilt lazily
        # on the Evidence Graph page. Build every graph explicitly here.
        from app.services import graph_service

        for spec in RELATED_CASES:
            other = db.scalar(select(Case).where(Case.case_number == spec["case_number"]))
            if other is not None:
                graph_service.rebuild_graph_for_case(db, other.id)
                case_similarity_service.compute_similarities_for_case(db, other.id)
        graph_service.rebuild_graph_for_case(db, case.id)
        case_similarity_service.compute_similarities_for_case(db, case.id)
    else:
        raise ScenarioError(f"Unknown followup action '{action}'")


async def _related_cases(db: Session, inspector: User) -> None:
    """
    The earlier files that share the Riverside signature. Each is a real case
    with its own evidence, ingested through the same pipeline; the inspector
    and the sub-inspector are attached so lower ranks can open them too.
    Idempotent: an item is only ingested if its filename is not already in
    that case.
    """
    si = _user_by_badge(db, "SI-1042")
    for spec in RELATED_CASES:
        other = db.scalar(select(Case).where(Case.case_number == spec["case_number"]))
        if other is None:
            other = Case(case_number=spec["case_number"], title=spec["title"], description=spec["description"], created_by=inspector.id)
            db.add(other)
            db.commit()
            db.refresh(other)
        for member in (inspector, si):
            if not db.scalar(select(CaseMember.id).where(CaseMember.case_id == other.id, CaseMember.user_id == member.id)):
                db.add(CaseMember(case_id=other.id, user_id=member.id))
        db.commit()
        existing = set(db.scalars(select(Evidence.original_filename).where(Evidence.case_id == other.id)).all())
        for item in spec["items"]:
            if item.filename in existing:
                continue
            uploader = _user_by_badge(db, item.uploader_badge)
            file_bytes, content_type = make_file_bytes(item)
            await evidence_service.ingest_evidence(
                db,
                case_id=other.id,
                evidence_type=item.evidence_type,
                file_bytes=file_bytes,
                original_filename=item.filename,
                content_type=content_type,
                uploader=uploader,
                witness_officer_id=None,
                device_metadata={DEMO_TAG: "related_cases", "device_id": f"demo-{uploader.badge_number}"},
                captured_at=item.captured_at,
                gps_lat=item.gps[0] if item.gps else None,
                gps_lng=item.gps[1] if item.gps else None,
                description=item.description,
                language=item.language,
                extracted_text=item.text,
            )
        await location_service.compute_scores_for_case(db, other.id)


async def _custody_trail(db: Session, case: Case) -> None:
    """
    What happens to exhibits after collection: the knife and the scene report
    go to the State FSL, the Superintendent reviews the file, the exhibits
    come back. Written through the same ChainOfCustodyEvent rows the API
    reads, so the Chain of Custody page shows a real trail, not a stub.
    """
    forensic = _user_by_badge(db, "FR-3390")
    sp = _user_by_badge(db, "SP-2201")
    inspector = _user_by_badge(db, "INSP-3310")
    from datetime import datetime, timezone

    def _ts(day: int, hh: int, mm: int) -> datetime:
        return datetime(2025, 4, day, hh, mm, tzinfo=timezone.utc)

    trail = {
        "seized-knife-photo.png": [
            (CustodyAction.TRANSFERRED, inspector, _ts(15, 6, 30), "Exhibit sealed in evidence bag E-0412-03 and handed to State FSL courier."),
            (CustodyAction.VIEWED, forensic, _ts(16, 4, 0), "Examined at State FSL Chennai — prints and blood lifted."),
            (CustodyAction.TRANSFERRED, forensic, _ts(18, 9, 45), "Returned to Riverside Police Station property room, seal intact."),
        ],
        "scene-report-412.txt": [
            (CustodyAction.VIEWED, sp, _ts(17, 5, 15), "Reviewed by the Superintendent during the weekly case review."),
        ],
        "fsl-report-2025-0418.txt": [
            (CustodyAction.VIEWED, sp, _ts(19, 3, 40), "Reviewed by the Superintendent before pre-filing."),
        ],
    }
    for filename, events in trail.items():
        ev = db.scalar(select(Evidence).where(Evidence.case_id == case.id, Evidence.original_filename == filename).limit(1))
        if ev is None:
            continue
        have = {(c.action, c.actor_id) for c in db.scalars(select(ChainOfCustodyEvent).where(ChainOfCustodyEvent.evidence_id == ev.id))}
        for action, actor, when, notes in events:
            if (action, actor.id) in have:
                continue
            db.add(ChainOfCustodyEvent(evidence_id=ev.id, action=action, actor_id=actor.id, occurred_at=when, notes=notes, hash_at_event=ev.sha256_hash))
    db.commit()


def reset_case(db: Session, case: Case) -> dict:
    """
    Removes everything DERIVED for a case — evidence, custody trail, AI
    outputs, graph, scores, RAG chunks — and leaves the case row, its members
    and the audit log intact. The audit log deliberately survives: a reset is
    itself an auditable act, and the trail of what happened before it is not
    the demo's to erase.
    """
    case_id = case.id
    evidence_ids = db.scalars(select(Evidence.id).where(Evidence.case_id == case_id)).all()

    # Children first, parents last — FK order.
    db.execute(delete(StatementVersion).where(StatementVersion.evidence_id.in_(evidence_ids)))
    db.execute(delete(ChainOfCustodyEvent).where(ChainOfCustodyEvent.evidence_id.in_(evidence_ids)))
    db.execute(delete(AutopsyFinding).where(AutopsyFinding.case_id == case_id))
    db.execute(delete(Contradiction).where(Contradiction.case_id == case_id))
    db.execute(delete(GuidanceSuggestion).where(GuidanceSuggestion.case_id == case_id))
    db.execute(delete(TimelineEvent).where(TimelineEvent.case_id == case_id))
    db.execute(delete(EntityRelationship).where(EntityRelationship.case_id == case_id))
    db.execute(delete(Entity).where(Entity.case_id == case_id))
    db.execute(delete(LocationScore).where(LocationScore.case_id == case_id))
    db.execute(delete(ChargesheetCheck).where(ChargesheetCheck.case_id == case_id))
    db.execute(delete(ClosureReadinessScore).where(ClosureReadinessScore.case_id == case_id))
    db.execute(
        delete(CaseSimilarityMatch).where(
            (CaseSimilarityMatch.case_id == case_id) | (CaseSimilarityMatch.matched_case_id == case_id)
        )
    )
    db.execute(delete(RagChunk).where(RagChunk.case_id == case_id))
    db.execute(delete(ChainAnchor).where(ChainAnchor.case_id == case_id))
    db.execute(delete(OfflineSyncQueueEntry).where(OfflineSyncQueueEntry.device_id == "field-tablet-07"))
    # The related cases stay (they are their own files); their similarity rows to this case go.
    db.execute(delete(Evidence).where(Evidence.case_id == case_id))
    db.commit()
    logger.info("Demo case %s reset: %d evidence items removed", case_id, len(evidence_ids))
    return {"removed_evidence": len(evidence_ids), **describe(db, case_id)}


__all__ = ["describe", "load_next_stage", "load_all", "reset_case", "ScenarioError", "user_repository"]
