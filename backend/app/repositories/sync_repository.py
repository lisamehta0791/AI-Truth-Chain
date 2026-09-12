from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.rag import OfflineSyncQueueEntry


def create(db: Session, entry: OfflineSyncQueueEntry) -> OfflineSyncQueueEntry:
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_for_device(db: Session, device_id: str) -> list[OfflineSyncQueueEntry]:
    stmt = (
        select(OfflineSyncQueueEntry)
        .where(OfflineSyncQueueEntry.device_id == device_id)
        .order_by(OfflineSyncQueueEntry.created_at.desc())
    )
    return list(db.scalars(stmt))
