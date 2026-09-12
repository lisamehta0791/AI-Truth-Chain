"""
Evidence ingestion orchestration.

Flow (matches the build prompt's required pipeline exactly):
  Evidence bytes
    -> two-person confirmation check (some types require a witnessing officer)
    -> device metadata lock (stored once, immutable after this point)
    -> SHA-256 hash of file bytes
    -> previous_hash pulled from the last evidence item logged for this case
    -> object storage upload
    -> Evidence row created
    -> chain-of-custody "collected" event written
    -> AI extraction + contradiction detection (Phase 3), only once the item
       is fully LOGGED (i.e. immediately if no witness is required, or right
       after the witness confirms)

Hashing/storage/custody in this file remain deterministic, non-AI services
per PDF §6. The AI hand-off lives in `_run_ai_pipeline`, clearly separated so
that distinction stays visible in code, not just in comments.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.permissions import requires_live_capture
from app.core.websocket_manager import manager
from app.models.evidence import ChainOfCustodyEvent, CustodyAction, Evidence, EvidenceStatus, EvidenceType
from app.models.timeline import TimelineEvent, VerificationStatus
from app.models.user import User
from app.repositories import evidence_repository, timeline_repository
from app.services import autopsy_service, contradiction_service, guidance_service, hash_chain_service, location_service, storage_service
from app.services.ai import extraction, rag_engine
from app.services.ai.provider import AIProviderError
from app.services.audit_service import log_action

logger = logging.getLogger(__name__)

# Physical/media evidence collected in the field requires a second officer to
# witness/confirm the collection before it is considered fully "logged" —
# PDF §3.1's fix for chain-of-custody integrity. Records/statements captured
# digitally (e.g. a typed statement, a phone-record export) do not need a
# physical witness at collection time.
TWO_PERSON_CONFIRMATION_REQUIRED_TYPES = {
    EvidenceType.PHOTO,
    EvidenceType.VIDEO,
    EvidenceType.AUDIO,
    EvidenceType.SEIZED_ITEM,
}


class WitnessRequiredError(Exception):
    pass


class InvalidWitnessError(Exception):
    pass


class LiveCaptureRequiredError(Exception):
    """Raised when a field-rank officer logs evidence without proof-of-presence."""


async def ingest_evidence(
    db: Session,
    *,
    case_id: uuid.UUID,
    evidence_type: EvidenceType,
    file_bytes: bytes,
    original_filename: str | None,
    content_type: str | None,
    uploader: User,
    witness_officer_id: uuid.UUID | None,
    device_metadata: dict | None,
    captured_at: datetime | None,
    gps_lat: float | None,
    gps_lng: float | None,
    description: str | None,
    language: str | None,
    extracted_text: str | None = None,
    live_capture_bytes: bytes | None = None,
    live_capture_content_type: str | None = None,
) -> Evidence:
    requires_witness = evidence_type in TWO_PERSON_CONFIRMATION_REQUIRED_TYPES

    if requires_witness and witness_officer_id is None:
        raise WitnessRequiredError(
            f"Evidence type '{evidence_type.value}' requires a second confirming officer at collection time."
        )
    if witness_officer_id is not None and witness_officer_id == uploader.id:
        raise InvalidWitnessError("The witnessing officer must be a different person from the uploader.")

    # Proof-of-presence gate. Checked BEFORE anything is written or hashed, so
    # a rejected upload leaves no partial record and no gap in the hash chain.
    if requires_live_capture(uploader) and not live_capture_bytes:
        raise LiveCaptureRequiredError(
            f"Rank '{uploader.rank.value}' must submit a live camera capture when logging evidence. "
            "Take the photo with the device camera at the point of collection."
        )

    file_hash = hash_chain_service.compute_sha256(file_bytes)
    previous_evidence = evidence_repository.get_last_for_case(db, case_id)
    previous_hash = previous_evidence.sha256_hash if previous_evidence else None

    evidence = Evidence(
        case_id=case_id,
        evidence_type=evidence_type,
        status=EvidenceStatus.PENDING_CONFIRMATION if requires_witness else EvidenceStatus.LOGGED,
        uploaded_by=uploader.id,
        witness_officer_id=witness_officer_id,
        original_filename=original_filename,
        device_metadata=device_metadata,
        captured_at=captured_at,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        sha256_hash=file_hash,
        previous_hash=previous_hash,
        description=description,
        language=language,
        extracted_text=extracted_text,
    )
    evidence = evidence_repository.create(db, evidence)

    object_key = storage_service.build_object_key(case_id, evidence.id, original_filename)
    storage_service.upload_bytes(object_key, file_bytes, content_type)
    evidence.storage_key = object_key

    if live_capture_bytes:
        capture_key = storage_service.build_object_key(
            case_id, evidence.id, f"live-capture-{uploader.badge_number}.jpg"
        )
        storage_service.upload_bytes(capture_key, live_capture_bytes, live_capture_content_type or "image/jpeg")
        evidence.live_capture_key = capture_key
        evidence.live_capture_sha256 = hash_chain_service.compute_sha256(live_capture_bytes)
        evidence.live_capture_at = datetime.now(timezone.utc)

    evidence = evidence_repository.update(db, evidence)

    evidence_repository.add_custody_event(
        db,
        ChainOfCustodyEvent(
            evidence_id=evidence.id,
            actor_id=uploader.id,
            action=CustodyAction.COLLECTED,
            hash_at_event=file_hash,
            notes=(
                f"Live capture recorded at collection (sha256 {evidence.live_capture_sha256[:16]}...)."
                if evidence.live_capture_sha256
                else None
            ),
        ),
    )
    if not requires_witness:
        evidence_repository.add_custody_event(
            db,
            ChainOfCustodyEvent(
                evidence_id=evidence.id,
                actor_id=uploader.id,
                action=CustodyAction.HASH_LOGGED,
                hash_at_event=file_hash,
                notes="No second-officer confirmation required for this evidence type.",
            ),
        )

    log_action(
        db, actor=uploader, action="evidence.upload", target_type="evidence",
        target_id=str(evidence.id), case_id=case_id,
        metadata={"evidence_type": evidence_type.value, "requires_witness": requires_witness},
    )

    await manager.broadcast(
        case_id,
        {
            "type": "evidence.logged",
            "evidence_id": str(evidence.id),
            "evidence_type": evidence_type.value,
            "sha256_hash": evidence.sha256_hash,
            "status": evidence.status.value,
        },
    )

    if not requires_witness:
        if evidence.gps_lat is not None and evidence.gps_lng is not None:
            await location_service.compute_scores_for_case(db, case_id)
        await _run_ai_pipeline(db, evidence)

    return evidence


async def confirm_witness(db: Session, *, evidence: Evidence, witness: User, notes: str | None) -> Evidence:
    if evidence.witness_officer_id is not None and evidence.witness_officer_id != witness.id:
        raise InvalidWitnessError("A different witnessing officer was already assigned to this evidence item.")
    if evidence.uploaded_by == witness.id:
        raise InvalidWitnessError("The uploader cannot also be the confirming witness.")

    evidence.witness_officer_id = witness.id
    evidence.status = EvidenceStatus.LOGGED
    evidence = evidence_repository.update(db, evidence)

    evidence_repository.add_custody_event(
        db,
        ChainOfCustodyEvent(
            evidence_id=evidence.id,
            actor_id=witness.id,
            action=CustodyAction.WITNESS_CONFIRMED,
            hash_at_event=evidence.sha256_hash,
            notes=notes,
        ),
    )
    evidence_repository.add_custody_event(
        db,
        ChainOfCustodyEvent(
            evidence_id=evidence.id,
            actor_id=witness.id,
            action=CustodyAction.HASH_LOGGED,
            hash_at_event=evidence.sha256_hash,
        ),
    )

    log_action(
        db, actor=witness, action="evidence.witness_confirm", target_type="evidence",
        target_id=str(evidence.id), case_id=evidence.case_id,
    )

    await manager.broadcast(
        evidence.case_id,
        {"type": "evidence.witness_confirmed", "evidence_id": str(evidence.id)},
    )

    if evidence.gps_lat is not None and evidence.gps_lng is not None:
        await location_service.compute_scores_for_case(db, evidence.case_id)

    await _run_ai_pipeline(db, evidence)
    return evidence


def _parse_stated_time(value: object) -> datetime | None:
    """
    Accepts an event_time the model claims to have read from the evidence.
    Returns None unless it is a real, plausible, timezone-aware timestamp.

    Two failure modes this guards against, both seen in practice:
      * A bare clock time ("00:30") parsed into 1970-01-02 — a fabricated
        date that then produced a "contradiction" against real evidence.
      * The model echoing the upload timestamp as if it were the event time.
    Anything before 1990 or more than a day in the future is discarded.
    """
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if parsed.year < 1990 or parsed > now + timedelta(days=1):
        return None
    return parsed


def _describe_event_for_comparison(event: TimelineEvent) -> str:
    """
    Builds the text the Contradiction Detector compares against retrieved case
    context.

    This MUST carry the event's timestamp. The extractor writes
    `event.description` as prose without a time ("Ramesh observed the suspect
    leaving the lobby") and puts the time in the separate `event_time` column.
    Passing the bare description therefore hid the single most common class of
    contradiction in this domain — a time conflict, which is the spec's own
    worked example (PDF §3.3: witness says 9 PM, CCTV shows otherwise). With
    the time omitted the detector correctly found nothing to disagree about
    and every such conflict was silently missed.
    """
    parts: list[str] = []
    time_stated = bool((event.extracted_entities or {}).get("time_stated"))
    if event.event_time is not None and time_stated:
        parts.append(f"Time: {event.event_time.isoformat()}")
    else:
        parts.append("Time: not stated in the source (do not treat the logging time as the event time)")
    if event.event_type:
        parts.append(f"Type: {event.event_type}")
    parts.append(f"Event: {event.description}")
    if event.source_excerpt:
        parts.append(f"Source excerpt: {event.source_excerpt}")
    return "\n".join(parts)


async def _run_ai_pipeline(db: Session, evidence: Evidence) -> None:
    """
    AI Timeline Builder + Contradiction Detector hand-off (PDF §3.2/§3.3).
    Only runs once evidence is LOGGED.

    This wrapper is what makes the module docstring's promise true: AI is an
    assist layer, never a blocker for evidence integrity (PDF §2). The
    evidence row and its hash-chain link are already COMMITTED before we get
    here, so any AI failure — no API key configured, provider outage, rate
    limit, malformed model output — is logged and swallowed rather than
    turning a successful, correctly-hashed evidence upload into an HTTP 500.

    Without this guard, running the system with no AI key set (the documented
    keyless-demo mode) made every evidence upload fail.
    """
    try:
        await _run_ai_pipeline_stages(db, evidence)
    except AIProviderError as exc:
        # Expected, non-alarming path: AI is simply not configured/available.
        logger.warning(
            "AI pipeline skipped for evidence %s — provider unavailable: %s", evidence.id, exc
        )
        db.rollback()
        await _broadcast_ai_skipped(evidence, reason=str(exc))
    except Exception as exc:  # noqa: BLE001 — deliberate catch-all; see docstring
        logger.exception("AI pipeline failed for evidence %s", evidence.id)
        db.rollback()
        await _broadcast_ai_skipped(evidence, reason=f"{type(exc).__name__}: {exc}")


async def _broadcast_ai_skipped(evidence: Evidence, *, reason: str) -> None:
    """Tell the UI the AI stage produced nothing, so it can say so honestly
    instead of leaving a spinner up or implying 'no contradictions found'."""
    await manager.broadcast(
        evidence.case_id,
        {
            "type": "evidence.ai_skipped",
            "evidence_id": str(evidence.id),
            "reason": reason,
        },
    )


async def _run_ai_pipeline_stages(db: Session, evidence: Evidence) -> None:
    """The actual AI stages. Always call via `_run_ai_pipeline`, never directly."""
    if not evidence.extracted_text:
        return  # nothing for the LLM to read yet (e.g. a photo with no caption/OCR text)

    # The model/embedding clients are synchronous; run them off the event loop
    # so the API keeps answering (and the UI keeps updating) while a stage
    # of evidence is being processed. The session is used sequentially, never
    # concurrently, so handing it to a worker thread is safe.
    await asyncio.to_thread(
        rag_engine.ingest_text,
        db,
        source_type="evidence",
        source_id=str(evidence.id),
        case_id=evidence.case_id,
        text=evidence.extracted_text,
    )

    result = await asyncio.to_thread(
        extraction.extract_from_evidence_text,
        db, case_id=evidence.case_id, evidence_id=evidence.id, text=evidence.extracted_text,
    )

    created_events: list[TimelineEvent] = []
    for raw_event in result.get("events", []):
        stated_time = _parse_stated_time(raw_event.get("event_time"))
        event = TimelineEvent(
            case_id=evidence.case_id,
            source_evidence_id=evidence.id,
            event_time=stated_time or evidence.captured_at or evidence.uploaded_at,
            event_type=raw_event.get("event_type", "unspecified"),
            description=raw_event.get("description", ""),
            verification_status=VerificationStatus.AI_EXTRACTED_UNVERIFIED,
            confidence=raw_event.get("confidence"),
            # `time_stated` records whether event_time came from the evidence
            # itself. When it is False the stored time is only the upload
            # time used for ordering, and must never be treated as a fact —
            # see _describe_event_for_comparison and the timeline UI.
            extracted_entities={"entities": result.get("entities", []), "time_stated": stated_time is not None},
            source_excerpt=raw_event.get("source_excerpt"),
        )
        event = timeline_repository.create(db, event)
        created_events.append(event)

        await manager.broadcast(
            evidence.case_id,
            {
                "type": "timeline.event_extracted",
                "event_id": str(event.id),
                "description": event.description,
                "confidence": float(event.confidence) if event.confidence is not None else None,
                "source_evidence_id": str(evidence.id),
            },
        )

    for event in created_events:
        await contradiction_service.run_contradiction_check(
            db,
            case_id=evidence.case_id,
            new_evidence_id=evidence.id,
            new_event_description=_describe_event_for_comparison(event),
        )
        await guidance_service.generate_for_evidence(
            db,
            case_id=evidence.case_id,
            evidence_id=evidence.id,
            situation_text=event.description,
        )

    if evidence.evidence_type == EvidenceType.AUTOPSY_REPORT:
        await autopsy_service.run_cross_check(
            db, case_id=evidence.case_id, source_evidence_id=evidence.id, autopsy_text=evidence.extracted_text
        )

    await manager.broadcast(
        evidence.case_id,
        {"type": "evidence.ai_processed", "evidence_id": str(evidence.id), "events_extracted": len(created_events)},
    )


def verify_case_chain(db: Session, case_id: uuid.UUID) -> tuple[bool, int | None, int]:
    """Used by GET /evidence/case/{id}/chain-integrity and scripts/verify_hash_chain.py."""
    items = evidence_repository.list_for_case(db, case_id)
    pairs = [(item.sha256_hash, item.previous_hash) for item in items]
    is_valid, broken_index = hash_chain_service.verify_chain(pairs)
    return is_valid, broken_index, len(items)
