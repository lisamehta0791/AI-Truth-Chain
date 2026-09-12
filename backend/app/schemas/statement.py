import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StatementVersionCreate(BaseModel):
    evidence_id: uuid.UUID
    text: str
    language: str = "en"


class StatementVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    evidence_id: uuid.UUID
    version_no: int
    text: str
    language: str
    diff_from_previous: str | None
    recorded_at: datetime
