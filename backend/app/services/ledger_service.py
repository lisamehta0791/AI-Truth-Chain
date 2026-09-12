"""
Hash ledger: full verification, anchoring, and a presenter-only tamper drill.

Verification does two independent checks per block:
  1. FILE integrity — the stored object is downloaded and re-hashed; the
     result must equal the hash recorded at collection. Catches a swapped or
     edited evidence file.
  2. LINK integrity — each block's `previous_hash` must equal the prior
     block's hash. Catches a deleted, inserted or re-ordered record.

Both are deterministic cryptography. No AI is involved anywhere in this file.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.evidence import Evidence
from app.models.ledger import ChainAnchor
from app.models.user import User
from app.repositories import evidence_repository
from app.services import hash_chain_service, storage_service

logger = logging.getLogger(__name__)
settings = get_settings()

TAMPER_KEY = "_tamper_drill"  # stored in device_metadata while a drill is active


def _chain_digest(hashes: list[str]) -> str:
    return hashlib.sha256("".join(hashes).encode("utf-8")).hexdigest()


def _sign(case_id: uuid.UUID, head: str, digest: str, count: int, at: datetime) -> str:
    msg = f"{case_id}|{head}|{digest}|{count}|{at.isoformat()}".encode("utf-8")
    return hmac.new(settings.jwt_secret_key.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def verify(db: Session, case_id: uuid.UUID, *, recompute_files: bool = True) -> dict:
    items = evidence_repository.list_for_case(db, case_id)
    blocks: list[dict] = []
    expected_prev: str | None = None
    first_break: int | None = None
    reason: str | None = None

    for index, e in enumerate(items):
        recomputed: str | None = None
        file_ok: bool | None = None
        if recompute_files and e.storage_key:
            try:
                recomputed = hash_chain_service.compute_sha256(storage_service.download_bytes(e.storage_key))
                file_ok = recomputed == e.sha256_hash
            except Exception as exc:  # noqa: BLE001 — a missing object is itself a finding
                logger.warning("ledger: could not re-hash %s: %s", e.storage_key, exc)
                file_ok = False
        link_ok = e.previous_hash == expected_prev
        if first_break is None and (link_ok is False or file_ok is False):
            first_break = index
            reason = (
                "stored hash does not match the evidence file (file altered or database hash edited)"
                if file_ok is False
                else "previous_hash does not match the prior block (record deleted, inserted or reordered)"
            )
        blocks.append(
            {
                "index": index,
                "evidence_id": str(e.id),
                "description": e.description or e.original_filename,
                "evidence_type": e.evidence_type.value,
                "uploaded_at": e.uploaded_at.isoformat(),
                "uploaded_by": str(e.uploaded_by),
                "sha256_hash": e.sha256_hash,
                "previous_hash": e.previous_hash,
                "recomputed_hash": recomputed,
                "file_intact": file_ok,
                "link_intact": link_ok,
                "live_capture_sha256": e.live_capture_sha256,
                "tamper_drill": bool((e.device_metadata or {}).get(TAMPER_KEY)),
            }
        )
        expected_prev = e.sha256_hash

    hashes = [e.sha256_hash for e in items]
    head = hashes[-1] if hashes else None
    digest = _chain_digest(hashes) if hashes else None
    anchors = list(db.scalars(select(ChainAnchor).where(ChainAnchor.case_id == case_id).order_by(ChainAnchor.anchored_at.desc())))

    anchor_status = []
    for a in anchors:
        # An anchor "holds" if the chain up to its recorded length still
        # produces the same digest — i.e. nothing before that point changed.
        prefix_digest = _chain_digest(hashes[: a.evidence_count]) if len(hashes) >= a.evidence_count else None
        anchor_status.append(
            {
                "id": str(a.id),
                "head_hash": a.head_hash,
                "chain_digest": a.chain_digest,
                "evidence_count": a.evidence_count,
                "anchored_at": a.anchored_at.isoformat(),
                "anchored_by": str(a.anchored_by),
                "note": a.note,
                "holds": prefix_digest == a.chain_digest,
            }
        )

    return {
        "case_id": str(case_id),
        "evidence_count": len(items),
        "is_valid": first_break is None,
        "broken_at_index": first_break,
        "broken_reason": reason,
        "head_hash": head,
        "chain_digest": digest,
        "files_verified": recompute_files,
        "blocks": blocks,
        "anchors": anchor_status,
        "tamper_drill_active": any(b["tamper_drill"] for b in blocks),
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }


def anchor(db: Session, case_id: uuid.UUID, *, by: User, note: str | None) -> ChainAnchor:
    items = evidence_repository.list_for_case(db, case_id)
    hashes = [e.sha256_hash for e in items]
    if not hashes:
        raise ValueError("There is no evidence in this case to anchor yet.")
    now = datetime.now(timezone.utc)
    head, digest = hashes[-1], _chain_digest(hashes)
    record = ChainAnchor(
        case_id=case_id,
        head_hash=head,
        chain_digest=digest,
        evidence_count=len(hashes),
        anchored_by=by.id,
        anchored_at=now,
        note=note,
        signature=_sign(case_id, head, digest, len(hashes), now),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def checkpoint_document(db: Session, case_id: uuid.UUID) -> dict:
    """The exportable checkpoint — what gets stored OUTSIDE the database."""
    report = verify(db, case_id, recompute_files=False)
    latest = report["anchors"][0] if report["anchors"] else None
    return {
        "format": "chain-of-truth/checkpoint/v1",
        "case_id": report["case_id"],
        "generated_at": report["verified_at"],
        "evidence_count": report["evidence_count"],
        "head_hash": report["head_hash"],
        "chain_digest": report["chain_digest"],
        "block_hashes": [b["sha256_hash"] for b in report["blocks"]],
        "latest_anchor": latest,
        "how_to_verify": (
            "Recompute SHA-256 over the concatenated block hashes in order; it must equal chain_digest. "
            "Any later chain that does not reproduce this digest for the first evidence_count blocks has been altered."
        ),
    }


def simulate_tamper(db: Session, case_id: uuid.UUID, *, index: int) -> dict:
    """
    Presenter drill: edits ONE stored hash in the database, exactly as an
    insider with SQL access would, then re-verifies. The original value is
    kept alongside so `restore` can undo it. Refuses to stack drills.
    """
    items = evidence_repository.list_for_case(db, case_id)
    if not items:
        raise ValueError("No evidence to tamper with.")
    target = items[max(0, min(index, len(items) - 1))]
    meta = dict(target.device_metadata or {})
    if meta.get(TAMPER_KEY):
        raise ValueError("A tamper drill is already active — restore it first.")
    meta[TAMPER_KEY] = {"original_hash": target.sha256_hash, "started_at": datetime.now(timezone.utc).isoformat()}
    target.device_metadata = meta
    # A plausible-looking but wrong hash — what "quietly changing the record" looks like.
    target.sha256_hash = hashlib.sha256(f"tampered:{target.sha256_hash}".encode()).hexdigest()
    db.add(target)
    db.commit()
    return verify(db, case_id)


def restore(db: Session, case_id: uuid.UUID) -> dict:
    items = evidence_repository.list_for_case(db, case_id)
    for e in items:
        meta = dict(e.device_metadata or {})
        drill = meta.pop(TAMPER_KEY, None)
        if drill:
            e.sha256_hash = drill["original_hash"]
            e.device_metadata = meta
            db.add(e)
    db.commit()
    return verify(db, case_id)
