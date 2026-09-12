import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ClosureReadinessScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    score: float
    factors: dict
    computed_at: datetime
