import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import ClosureReadinessScore


def create(db: Session, score: ClosureReadinessScore) -> ClosureReadinessScore:
    db.add(score)
    db.commit()
    db.refresh(score)
    return score


def get_latest_for_case(db: Session, case_id: uuid.UUID) -> ClosureReadinessScore | None:
    stmt = (
        select(ClosureReadinessScore)
        .where(ClosureReadinessScore.case_id == case_id)
        .order_by(ClosureReadinessScore.computed_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)
