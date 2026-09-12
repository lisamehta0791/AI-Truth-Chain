"""
Offline-First Logging (build prompt's OFFLINE-FIRST section).

This queue preserves exactly what the build prompt requires — original
client-side timestamp and original hash — for evidence captured without
connectivity. What this deliberately does NOT do: automatically re-run the
full evidence ingestion pipeline (hash-chain linking, storage upload, AI
extraction) from a queued entry, because that would require shipping raw
file bytes through a JSON queue, which doesn't scale and isn't what a real
mobile offline-capture client would do (it would sync the file separately).

Per the build prompt: "If full production-grade offline synchronization
cannot be implemented in the initial hackathon version, implement a
realistic local queue/sync architecture and clearly label it as demo
functionality." That is exactly what this module is — a real, inspectable
queue table and API, with reconciliation into the evidence pipeline left as
the next real implementation step, not silently pretended to be automatic.
"""
from sqlalchemy.orm import Session

from app.models.rag import OfflineSyncQueueEntry
from app.repositories import sync_repository


def enqueue_batch(db: Session, *, device_id: str, entries: list[dict]) -> list[OfflineSyncQueueEntry]:
    created = []
    for entry in entries:
        record = OfflineSyncQueueEntry(
            device_id=device_id,
            payload=entry["payload"],
            original_timestamp=entry["original_timestamp"],
            original_hash=entry["original_hash"],
        )
        created.append(sync_repository.create(db, record))
    return created
