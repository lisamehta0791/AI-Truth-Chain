import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.case import CaseStatus


class CaseCreate(BaseModel):
    case_number: str
    title: str
    description: str | None = None


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_number: str
    title: str
    description: str | None
    status: CaseStatus
    created_by: uuid.UUID
    created_at: datetime
