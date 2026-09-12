import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.case import Case, CaseMember


def get_by_id(db: Session, case_id: uuid.UUID) -> Case | None:
    return db.get(Case, case_id)


def get_by_case_number(db: Session, case_number: str) -> Case | None:
    return db.scalar(select(Case).where(Case.case_number == case_number))


def create(db: Session, case: Case) -> Case:
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def list_for_user(db: Session, user_id: uuid.UUID) -> list[Case]:
    stmt = (
        select(Case)
        .join(CaseMember, CaseMember.case_id == Case.id)
        .where(CaseMember.user_id == user_id)
        .order_by(Case.case_number.asc())  # stable, demo case first; newest-first put test scratch cases on top of every page
    )
    return list(db.scalars(stmt))


def add_member(db: Session, case_id: uuid.UUID, user_id: uuid.UUID) -> CaseMember:
    member = CaseMember(case_id=case_id, user_id=user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def list_all(db: Session) -> list[Case]:
    """Every case — for ranks with cross-case visibility (Superintendent and above)."""
    return list(db.scalars(select(Case).order_by(Case.case_number.asc())))
