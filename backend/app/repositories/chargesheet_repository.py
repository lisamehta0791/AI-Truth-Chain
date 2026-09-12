import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.analysis import ChargesheetCheck


def create(db: Session, check: ChargesheetCheck) -> ChargesheetCheck:
    db.add(check)
    db.commit()
    db.refresh(check)
    return check


def list_for_case(db: Session, case_id: uuid.UUID) -> list[ChargesheetCheck]:
    stmt = select(ChargesheetCheck).where(ChargesheetCheck.case_id == case_id).order_by(ChargesheetCheck.created_at.desc())
    return list(db.scalars(stmt))


def delete_for_case(db: Session, case_id: uuid.UUID) -> None:
    """Each QA run replaces the previous run's results for the case, rather than accumulating stale checks."""
    db.execute(delete(ChargesheetCheck).where(ChargesheetCheck.case_id == case_id))
    db.commit()
