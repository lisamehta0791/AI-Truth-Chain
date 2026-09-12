import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OfflineSyncEntryIn(BaseModel):
    payload: dict
    original_timestamp: datetime
    original_hash: str


class OfflineSyncBatchRequest(BaseModel):
    device_id: str
    entries: list[OfflineSyncEntryIn]


class OfflineSyncQueueEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_id: str
    payload: dict
    original_timestamp: datetime
    original_hash: str
    synced_at: datetime | None
    created_at: datetime
