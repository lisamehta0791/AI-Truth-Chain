import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.analysis import LocationScore


def create(db: Session, score: LocationScore) -> LocationScore:
    db.add(score)
    db.commit()
    db.refresh(score)
    return score


def list_for_case(db: Session, case_id: uuid.UUID) -> list[LocationScore]:
    stmt = select(LocationScore).where(LocationScore.case_id == case_id).order_by(LocationScore.score.desc())
    return list(db.scalars(stmt))


def delete_for_case(db: Session, case_id: uuid.UUID) -> None:
    """Scores are fully recomputed on each run rather than patched incrementally."""
    db.execute(delete(LocationScore).where(LocationScore.case_id == case_id))
    db.commit()
