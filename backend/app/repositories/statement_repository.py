import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import StatementVersion


def create(db: Session, version: StatementVersion) -> StatementVersion:
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def list_for_evidence(db: Session, evidence_id: uuid.UUID) -> list[StatementVersion]:
    stmt = (
        select(StatementVersion)
        .where(StatementVersion.evidence_id == evidence_id)
        .order_by(StatementVersion.version_no.asc())
    )
    return list(db.scalars(stmt))


def get_latest_for_evidence(db: Session, evidence_id: uuid.UUID) -> StatementVersion | None:
    stmt = (
        select(StatementVersion)
        .where(StatementVersion.evidence_id == evidence_id)
        .order_by(StatementVersion.version_no.desc())
        .limit(1)
    )
    return db.scalar(stmt)
