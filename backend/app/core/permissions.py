"""
Central Role- and Rank-Based Access Control.

Two independent axes, deliberately kept separate:

  * UserRole  — WHAT you do on a case (investigating officer, supervisor,
                forensic reviewer, legal reviewer). Gates which *workflows*
                you may act in.
  * PoliceRank — HOW SENIOR you are (Constable … DGP). Gates how *much* you
                see, and who you may provision accounts for.

Collapsing these into one enum was tempting but wrong: a Constable and a
Commissioner can both be the investigating officer of record, and a forensic
reviewer's authority comes from their function, not their seniority.

A third, overriding axis is `User.is_view_only`: an oversight account that may
read at its rank's clearance but must never mutate anything. It is checked
last and always wins, so a view-only Commissioner sees everything and can
change nothing.

This module is the ONE place this logic lives. Frontend pages may hide UI for
convenience; the backend is the actual enforcement point (PDF §7).
"""
from fastapi import Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.user import PoliceRank, RANK_SENIORITY, User, UserRole

# ---------------------------------------------------------------- clearance

# Rank thresholds for progressively more sensitive material. Expressed as the
# MINIMUM rank that unlocks each tier, resolved through RANK_SENIORITY so
# inserting a new rank later doesn't silently regrade anyone.
MIN_RANK_CONFIRM_AI_OUTPUT = PoliceRank.SUB_INSPECTOR
MIN_RANK_VIEW_PII = PoliceRank.SUB_INSPECTOR
MIN_RANK_VIEW_AUDIT_LOG = PoliceRank.INSPECTOR
MIN_RANK_MANAGE_ACCOUNTS = PoliceRank.DEPUTY_SUPERINTENDENT
MIN_RANK_CROSS_CASE_VIEW = PoliceRank.SUPERINTENDENT

# Field ranks collect evidence in person. They must prove presence with a live
# capture at logging time (PDF §3.1's "multiple independent signals" fix) —
# see evidence_service.LIVE_CAPTURE_REQUIRED_BELOW_RANK.
FIELD_RANKS = {
    PoliceRank.CONSTABLE,
    PoliceRank.HEAD_CONSTABLE,
    PoliceRank.ASSISTANT_SUB_INSPECTOR,
}

RAW_EVIDENCE_ACCESS = {
    UserRole.INVESTIGATING_OFFICER,
    UserRole.SUPERVISOR,
    UserRole.FORENSIC_REVIEWER,
}
LEGAL_REVIEW_ACCESS = {UserRole.LEGAL_REVIEWER, UserRole.SUPERVISOR}
FORENSIC_ACCESS = {UserRole.FORENSIC_REVIEWER, UserRole.SUPERVISOR}
SUPERVISOR_ONLY = {UserRole.SUPERVISOR}


def seniority(user: User) -> int:
    return RANK_SENIORITY[user.rank]


def outranks(actor: User, other: User) -> bool:
    """Strictly senior. Equal ranks never outrank each other."""
    return seniority(actor) > seniority(other)


def has_min_rank(user: User, minimum: PoliceRank) -> bool:
    return RANK_SENIORITY[user.rank] >= RANK_SENIORITY[minimum]


# ------------------------------------------------------------- capabilities

def can_view_raw_evidence(user: User) -> bool:
    return user.role in RAW_EVIDENCE_ACCESS


def can_view_pii(user: User) -> bool:
    """Victim/witness identifying details (PDF §7 data minimization)."""
    return has_min_rank(user, MIN_RANK_VIEW_PII)


def can_view_audit_log(user: User) -> bool:
    return has_min_rank(user, MIN_RANK_VIEW_AUDIT_LOG)


def can_manage_accounts(user: User) -> bool:
    return has_min_rank(user, MIN_RANK_MANAGE_ACCOUNTS) and not user.is_view_only


def can_view_all_cases(user: User) -> bool:
    return has_min_rank(user, MIN_RANK_CROSS_CASE_VIEW)


def can_confirm_ai_output(user: User) -> bool:
    """
    Confirming/dismissing an AI finding is the human-verification step the
    whole design rests on (PDF §2), so it is deliberately NOT available to
    view-only accounts or to ranks below Sub-Inspector.
    """
    return has_min_rank(user, MIN_RANK_CONFIRM_AI_OUTPUT) and not user.is_view_only


def requires_live_capture(user: User) -> bool:
    return user.rank in FIELD_RANKS


def can_create_rank(actor: User, target_rank: PoliceRank) -> bool:
    """
    Accounts are provisioned strictly top-down: you may create an account only
    for a rank BELOW your own, and only if you hold an account-managing rank.
    This is what stops a Sub-Inspector minting a Commissioner login.
    """
    if not can_manage_accounts(actor):
        return False
    return RANK_SENIORITY[target_rank] < RANK_SENIORITY[actor.rank]


# ------------------------------------------------------------- dependencies

def require_role(*allowed_roles: UserRole):
    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' is not permitted to perform this action.",
            )
        return current_user

    return _dependency


def require_min_rank(minimum: PoliceRank):
    def _dependency(current_user: User = Depends(get_current_user)) -> User:
        if not has_min_rank(current_user, minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Rank '{current_user.rank.value}' is not senior enough for this action "
                    f"(requires {minimum.value} or above)."
                ),
            )
        return current_user

    return _dependency


def require_writer(current_user: User = Depends(get_current_user)) -> User:
    """
    Blocks every mutating route for oversight accounts. Applied in addition to
    (not instead of) role/rank checks.
    """
    if current_user.is_view_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This is a view-only oversight account and cannot modify case records.",
        )
    return current_user
