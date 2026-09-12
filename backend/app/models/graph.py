import enum
import uuid

from sqlalchemy import Enum, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EntityType(str, enum.Enum):
    PERSON = "person"
    OFFICER = "officer"
    DOCTOR = "doctor"
    SUSPECT = "suspect"
    WITNESS = "witness"
    LOCATION = "location"
    EVENT = "event"
    EVIDENCE = "evidence"
    DOCUMENT = "document"
    DEVICE = "device"


class Entity(Base):
    """A node in the evidence graph."""
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    entity_type: Mapped[EntityType] = mapped_column(Enum(EntityType, name="entity_type"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class RelationType(str, enum.Enum):
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"
    MENTIONS = "mentions"
    RELATED_TO = "related_to"
    LOCATED_AT = "located_at"
    DERIVED_FROM = "derived_from"


class EntityRelationship(Base):
    """An edge in the evidence graph — queried via recursive CTE for traversal."""
    __tablename__ = "entity_relationships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"))
    from_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"))
    to_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"))
    relation_type: Mapped[RelationType] = mapped_column(Enum(RelationType, name="relation_type"))
    source_evidence_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evidence.id"), nullable=True
    )
