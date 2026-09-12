from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.permissions import require_writer
from app.db.session import get_db
from app.models.user import User
from app.repositories import sync_repository
from app.schemas.sync import OfflineSyncBatchRequest, OfflineSyncQueueEntryOut
from app.services import sync_service

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/offline-batch", response_model=list[OfflineSyncQueueEntryOut], dependencies=[Depends(require_writer)])
def submit_offline_batch(
    data: OfflineSyncBatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OfflineSyncQueueEntryOut]:
    entries = [entry.model_dump() for entry in data.entries]
    return sync_service.enqueue_batch(db, device_id=data.device_id, entries=entries)


@router.get("/status", response_model=list[OfflineSyncQueueEntryOut])
def sync_status(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OfflineSyncQueueEntryOut]:
    return sync_repository.list_for_device(db, device_id)
