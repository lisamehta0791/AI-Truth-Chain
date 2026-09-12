from sqlalchemy.orm import Session

from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.models.user import User
from app.repositories import user_repository
from app.schemas.user import AccountProvisionRequest, UserCreate


class InvalidCredentialsError(Exception):
    pass


def register_user(db: Session, data: UserCreate) -> User:
    user = User(
        full_name=data.full_name,
        badge_number=data.badge_number,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        rank=data.rank,
        station=data.station,
    )
    return user_repository.create(db, user)


def provision_account(db: Session, data: AccountProvisionRequest, *, created_by: User) -> User:
    """
    Creates a subordinate's account.

    `created_by` is taken from the authenticated caller, never from the request
    body, and is persisted so the chain of who authorised each login is itself
    auditable. Rank eligibility is enforced by the caller
    (api/v1/users.py -> permissions.can_create_rank).
    """
    user = User(
        full_name=data.full_name,
        badge_number=data.badge_number,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        rank=data.rank,
        station=data.station,
        is_view_only=data.is_view_only,
        created_by_id=created_by.id,
    )
    return user_repository.create(db, user)


def authenticate(db: Session, email: str, password: str) -> User:
    user = user_repository.get_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Invalid email or password")
    if not user.is_active:
        raise InvalidCredentialsError("Account is disabled")
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    access = create_access_token(subject=str(user.id), role=user.role.value)
    refresh = create_refresh_token(subject=str(user.id))
    return access, refresh
