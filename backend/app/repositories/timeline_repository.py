import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.timeline import TimelineEvent


def create(db: Session, event: TimelineEvent) -> TimelineEvent:
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_by_id(db: Session, event_id: uuid.UUID) -> TimelineEvent | None:
    return db.get(TimelineEvent, event_id)


def list_for_case(db: Session, case_id: uuid.UUID) -> list[TimelineEvent]:
    stmt = select(TimelineEvent).where(TimelineEvent.case_id == case_id).order_by(TimelineEvent.event_time.asc())
    return list(db.scalars(stmt))


def update(db: Session, event: TimelineEvent) -> TimelineEvent:
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
