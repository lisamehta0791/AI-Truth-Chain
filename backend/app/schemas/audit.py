import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    role: str
    action: str
    target_type: str
    target_id: str | None
    case_id: uuid.UUID | None
    metadata_json: dict | None
    result: str
    timestamp: datetime
