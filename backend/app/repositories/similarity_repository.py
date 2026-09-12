import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.analysis import CaseSimilarityMatch


def create(db: Session, match: CaseSimilarityMatch) -> CaseSimilarityMatch:
    db.add(match)
    db.commit()
    db.refresh(match)
    return match


def list_for_case(db: Session, case_id: uuid.UUID) -> list[CaseSimilarityMatch]:
    stmt = (
        select(CaseSimilarityMatch)
        .where(CaseSimilarityMatch.case_id == case_id)
        .order_by(CaseSimilarityMatch.similarity_score.desc())
    )
    return list(db.scalars(stmt))


def clear_for_case(db: Session, case_id: uuid.UUID) -> None:
    db.execute(delete(CaseSimilarityMatch).where(CaseSimilarityMatch.case_id == case_id))
    db.commit()
