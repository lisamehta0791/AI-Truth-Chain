import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.permissions import (
    can_create_rank,
    can_manage_accounts,
    can_view_all_cases,
    outranks,
)
from app.db.session import get_db
from app.models.user import RANK_ABBREVIATION, RANK_SENIORITY, PoliceRank, User
from app.repositories import user_repository
from app.schemas.user import AccountProvisionRequest, OfficerDirectoryEntry, RankOption, UserOut
from app.services import auth_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["users"])


def _pretty_rank(rank: PoliceRank) -> str:
    return rank.value.replace("_", " ").title()


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user


@router.get("/ranks", response_model=list[RankOption])
def list_ranks(current_user: User = Depends(get_current_user)) -> list[RankOption]:
    """
    The ranks THIS officer may provision, junior-most first. Returns an empty
    list for anyone who cannot manage accounts, so the UI can hide the whole
    flow without duplicating the rank rules client-side.
    """
    if not can_manage_accounts(current_user):
        return []
    return [
        RankOption(
            value=rank,
            label=_pretty_rank(rank),
            abbreviation=RANK_ABBREVIATION[rank],
            seniority=RANK_SENIORITY[rank],
        )
        for rank in sorted(PoliceRank, key=lambda r: RANK_SENIORITY[r])
        if can_create_rank(current_user, rank)
    ]


@router.get("/directory", response_model=list[OfficerDirectoryEntry])
def officer_directory(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OfficerDirectoryEntry]:
    """
    Minimal roster for picking a colleague — e.g. the second officer who
    witnessed evidence collection. Available to EVERY authenticated rank,
    unlike the full personnel list, because a Constable has to be able to
    name the Sub-Inspector standing next to them. Exposes name, badge and
    rank only: no emails, no account status, nothing a junior rank should
    not see.
    """
    return [
        OfficerDirectoryEntry(
            id=u.id,
            full_name=u.full_name,
            badge_number=u.badge_number,
            rank_abbreviation=u.rank_abbreviation,
        )
        for u in user_repository.list_all(db)
        if u.is_active and u.id != current_user.id
    ]


@router.get("", response_model=list[UserOut])
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    """
    Personnel directory. Gated on RANK, not role: seeing the full roster is a
    command function. Officers below command rank get only their own record
    rather than a 403, so the page renders something useful for everyone
    instead of erroring.
    """
    if not can_manage_accounts(current_user) and not can_view_all_cases(current_user):
        return [current_user]
    return user_repository.list_all(db)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def provision_account(
    data: AccountProvisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """
    Top-down account provisioning: a Commissioner creates an SP, an SP creates
    an Inspector, and so on. You can never create an account at or above your
    own rank, which is what prevents privilege escalation by self-service.
    """
    if not can_manage_accounts(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Rank '{current_user.rank.value}' cannot provision accounts "
                "(requires deputy_superintendent or above, on a non view-only account)."
            ),
        )
    if not can_create_rank(current_user, data.rank):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You may only create accounts BELOW your own rank "
                f"('{current_user.rank.value}'). '{data.rank.value}' is not below it."
            ),
        )
    if user_repository.get_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="A user with this email already exists.")
    if user_repository.get_by_badge_number(db, data.badge_number):
        raise HTTPException(status_code=400, detail="A user with this badge number already exists.")

    user = auth_service.provision_account(db, data, created_by=current_user)
    log_action(
        db,
        actor=current_user,
        action="user.provision",
        target_type="user",
        target_id=str(user.id),
        metadata={"rank": user.rank.value, "role": user.role.value, "view_only": user.is_view_only},
    )
    return user


@router.post("/{user_id}/deactivate", response_model=UserOut)
def deactivate_account(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Deactivation, not deletion — an officer's audit history must survive."""
    if not can_manage_accounts(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your rank cannot manage accounts.")

    target = user_repository.get_by_id(db, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if not outranks(current_user, target):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only deactivate officers junior to you.",
        )

    target.is_active = False
    user_repository.update(db, target)
    log_action(
        db, actor=current_user, action="user.deactivate", target_type="user", target_id=str(target.id)
    )
    return target
