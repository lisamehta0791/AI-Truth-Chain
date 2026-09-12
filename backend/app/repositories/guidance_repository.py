import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contradiction import GuidanceSuggestion


def create(db: Session, suggestion: GuidanceSuggestion) -> GuidanceSuggestion:
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return suggestion


def get_by_id(db: Session, suggestion_id: uuid.UUID) -> GuidanceSuggestion | None:
    return db.get(GuidanceSuggestion, suggestion_id)


def list_for_case(db: Session, case_id: uuid.UUID) -> list[GuidanceSuggestion]:
    stmt = (
        select(GuidanceSuggestion)
        .where(GuidanceSuggestion.case_id == case_id)
        .order_by(GuidanceSuggestion.created_at.desc())
    )
    return list(db.scalars(stmt))


def update(db: Session, suggestion: GuidanceSuggestion) -> GuidanceSuggestion:
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return suggestion
