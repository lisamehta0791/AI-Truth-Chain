import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.graph import Entity, EntityRelationship, EntityType


def get_or_create_entity(db: Session, *, case_id: uuid.UUID, entity_type: EntityType, name: str) -> Entity:
    stmt = select(Entity).where(Entity.case_id == case_id, Entity.entity_type == entity_type, Entity.name == name)
    existing = db.scalar(stmt)
    if existing:
        return existing
    entity = Entity(case_id=case_id, entity_type=entity_type, name=name)
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


def create_relationship(db: Session, relationship: EntityRelationship) -> EntityRelationship:
    db.add(relationship)
    db.commit()
    db.refresh(relationship)
    return relationship


def list_entities_for_case(db: Session, case_id: uuid.UUID) -> list[Entity]:
    return list(db.scalars(select(Entity).where(Entity.case_id == case_id)))


def list_relationships_for_case(db: Session, case_id: uuid.UUID) -> list[EntityRelationship]:
    return list(db.scalars(select(EntityRelationship).where(EntityRelationship.case_id == case_id)))


def clear_for_case(db: Session, case_id: uuid.UUID) -> None:
    """The graph is fully rebuilt on each request rather than patched incrementally (hackathon-scale simplicity)."""
    db.execute(delete(EntityRelationship).where(EntityRelationship.case_id == case_id))
    db.execute(delete(Entity).where(Entity.case_id == case_id))
    db.commit()
