import uuid

from pydantic import BaseModel, ConfigDict


class CaseSimilarityMatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    matched_case_id: uuid.UUID
    similarity_score: float
    matched_factors: dict
