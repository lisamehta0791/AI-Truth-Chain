import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contradiction import Contradiction


def create(db: Session, contradiction: Contradiction) -> Contradiction:
    db.add(contradiction)
    db.commit()
    db.refresh(contradiction)
    return contradiction


def get_by_id(db: Session, contradiction_id: uuid.UUID) -> Contradiction | None:
    return db.get(Contradiction, contradiction_id)


def list_for_case(db: Session, case_id: uuid.UUID) -> list[Contradiction]:
    stmt = select(Contradiction).where(Contradiction.case_id == case_id).order_by(Contradiction.created_at.desc())
    return list(db.scalars(stmt))


def update(db: Session, contradiction: Contradiction) -> Contradiction:
    db.add(contradiction)
    db.commit()
    db.refresh(contradiction)
    return contradiction
