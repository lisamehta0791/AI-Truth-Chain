import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import AutopsyFinding


def create(db: Session, finding: AutopsyFinding) -> AutopsyFinding:
    db.add(finding)
    db.commit()
    db.refresh(finding)
    return finding


def get_by_id(db: Session, finding_id: uuid.UUID) -> AutopsyFinding | None:
    return db.get(AutopsyFinding, finding_id)


def list_for_case(db: Session, case_id: uuid.UUID) -> list[AutopsyFinding]:
    stmt = select(AutopsyFinding).where(AutopsyFinding.case_id == case_id).order_by(AutopsyFinding.created_at.desc())
    return list(db.scalars(stmt))


def update(db: Session, finding: AutopsyFinding) -> AutopsyFinding:
    db.add(finding)
    db.commit()
    db.refresh(finding)
    return finding
