import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserRole(str, enum.Enum):
    """
    WHAT a user does on a case — their function, not their seniority.
    Orthogonal to PoliceRank below (see the module docstring in
    app/core/permissions.py for how the two combine).
    """
    INVESTIGATING_OFFICER = "investigating_officer"
    SUPERVISOR = "supervisor"
    FORENSIC_REVIEWER = "forensic_reviewer"
    LEGAL_REVIEWER = "legal_reviewer"


class PoliceRank(str, enum.Enum):
    """
    HOW SENIOR a user is, following the Indian state police / commissionerate
    hierarchy. Seniority ordering lives in RANK_SENIORITY below — never compare
    these enum members directly, since Python enum order is not a permission
    model and reordering members would silently change who can see what.

    Parenthesised names are the commissionerate-system equivalents used in
    metropolitan forces.
    """
    CONSTABLE = "constable"
    HEAD_CONSTABLE = "head_constable"
    ASSISTANT_SUB_INSPECTOR = "assistant_sub_inspector"          # ASI
    SUB_INSPECTOR = "sub_inspector"                              # SI
    INSPECTOR = "inspector"                                      # Inspector / SHO
    DEPUTY_SUPERINTENDENT = "deputy_superintendent"              # DSP (ACP)
    SUPERINTENDENT = "superintendent"                            # SP (DCP)
    DEPUTY_INSPECTOR_GENERAL = "deputy_inspector_general"        # DIG (Jt. CP)
    INSPECTOR_GENERAL = "inspector_general"                      # IG (Addl. CP)
    COMMISSIONER = "commissioner"                                # Commissioner of Police
    DIRECTOR_GENERAL = "director_general"                        # DGP


# Numeric seniority. Higher number = more senior. Gaps are intentional so an
# intermediate rank can be inserted later without renumbering the whole ladder
# (which would silently change every stored permission comparison).
RANK_SENIORITY: dict[PoliceRank, int] = {
    PoliceRank.CONSTABLE: 10,
    PoliceRank.HEAD_CONSTABLE: 20,
    PoliceRank.ASSISTANT_SUB_INSPECTOR: 30,
    PoliceRank.SUB_INSPECTOR: 40,
    PoliceRank.INSPECTOR: 50,
    PoliceRank.DEPUTY_SUPERINTENDENT: 60,
    PoliceRank.SUPERINTENDENT: 70,
    PoliceRank.DEPUTY_INSPECTOR_GENERAL: 80,
    PoliceRank.INSPECTOR_GENERAL: 90,
    PoliceRank.COMMISSIONER: 100,
    PoliceRank.DIRECTOR_GENERAL: 110,
}

# Short forms shown in the UI (badge chips, tables) — kept server-side so the
# frontend never has to hardcode a rank vocabulary that could drift.
RANK_ABBREVIATION: dict[PoliceRank, str] = {
    PoliceRank.CONSTABLE: "PC",
    PoliceRank.HEAD_CONSTABLE: "HC",
    PoliceRank.ASSISTANT_SUB_INSPECTOR: "ASI",
    PoliceRank.SUB_INSPECTOR: "SI",
    PoliceRank.INSPECTOR: "INSP",
    PoliceRank.DEPUTY_SUPERINTENDENT: "DSP",
    PoliceRank.SUPERINTENDENT: "SP",
    PoliceRank.DEPUTY_INSPECTOR_GENERAL: "DIG",
    PoliceRank.INSPECTOR_GENERAL: "IG",
    PoliceRank.COMMISSIONER: "CP",
    PoliceRank.DIRECTOR_GENERAL: "DGP",
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    badge_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Function on a case.
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)

    # Seniority in the force. Defaults to SUB_INSPECTOR so existing rows get a
    # sane, low-privilege value rather than an implied command rank.
    rank: Mapped[PoliceRank] = mapped_column(
        Enum(PoliceRank, name="police_rank"),
        nullable=False,
        default=PoliceRank.SUB_INSPECTOR,
        # .name, not .value: SQLAlchemy persists native PG enums by member
        # NAME ('SUB_INSPECTOR'), so a lowercase default is not a valid label.
        server_default=PoliceRank.SUB_INSPECTOR.name,
    )

    # Oversight accounts (auditors, visiting legal reviewers) that may read a
    # case but must never mutate it. Applied ON TOP of rank: a view-only
    # Commissioner still sees everything and still cannot write anything.
    is_view_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    station: Mapped[str | None] = mapped_column(String(160), nullable=True)

    # Who provisioned this account. Accounts are created top-down by a senior
    # officer, so this is the audit trail for "who let this person in".
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case_memberships: Mapped[list["CaseMember"]] = relationship(back_populates="user")
    created_by: Mapped["User | None"] = relationship(remote_side=[id], backref="created_users")

    # ---- Convenience accessors used by permissions.py and the API schemas ----

    @property
    def seniority(self) -> int:
        return RANK_SENIORITY[self.rank]

    @property
    def rank_abbreviation(self) -> str:
        return RANK_ABBREVIATION[self.rank]
