import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.evidence import ChainOfCustodyEvent, Evidence


def create(db: Session, evidence: Evidence) -> Evidence:
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return evidence


def get_by_id(db: Session, evidence_id: uuid.UUID) -> Evidence | None:
    return db.get(Evidence, evidence_id)


def get_last_for_case(db: Session, case_id: uuid.UUID) -> Evidence | None:
    """Most recently uploaded evidence item in the case — its hash becomes the next link's previous_hash."""
    stmt = (
        select(Evidence)
        .where(Evidence.case_id == case_id)
        .order_by(Evidence.uploaded_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def list_for_case(db: Session, case_id: uuid.UUID) -> list[Evidence]:
    """Oldest-first — this is the chain order, and the order the UI renders the hash-chain strip in."""
    stmt = select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.uploaded_at.asc())
    return list(db.scalars(stmt))


def update(db: Session, evidence: Evidence) -> Evidence:
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return evidence


def add_custody_event(db: Session, event: ChainOfCustodyEvent) -> ChainOfCustodyEvent:
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_custody_events(db: Session, evidence_id: uuid.UUID) -> list[ChainOfCustodyEvent]:
    stmt = (
        select(ChainOfCustodyEvent)
        .where(ChainOfCustodyEvent.evidence_id == evidence_id)
        .order_by(ChainOfCustodyEvent.occurred_at.asc())
    )
    return list(db.scalars(stmt))
