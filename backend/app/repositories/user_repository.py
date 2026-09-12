import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_by_badge_number(db: Session, badge_number: str) -> User | None:
    return db.scalar(select(User).where(User.badge_number == badge_number))


def update(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_all(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)))
