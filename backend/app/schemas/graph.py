import uuid

from pydantic import BaseModel, ConfigDict

from app.models.graph import EntityType, RelationType


class EntityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: EntityType
    name: str
    attributes: dict | None


class EntityRelationshipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_entity_id: uuid.UUID
    to_entity_id: uuid.UUID
    relation_type: RelationType
    source_evidence_id: uuid.UUID | None


class GraphResponse(BaseModel):
    entities: list[EntityOut]
    relationships: list[EntityRelationshipOut]
