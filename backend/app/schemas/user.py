import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field

from app.models.user import RANK_ABBREVIATION, RANK_SENIORITY, PoliceRank, UserRole


class UserCreate(BaseModel):
    """Self-registration payload (bootstrap/dev). See AccountProvisionRequest
    for the real top-down account creation flow."""
    full_name: str
    badge_number: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: UserRole
    rank: PoliceRank = PoliceRank.SUB_INSPECTOR
    station: str | None = None


class AccountProvisionRequest(BaseModel):
    """
    A senior officer creating a subordinate's account. The creator's identity
    comes from the bearer token, never the body — otherwise anyone could claim
    to have been provisioned by the Commissioner.
    """
    full_name: str
    badge_number: str
    email: EmailStr
    password: str = Field(min_length=8, description="Temporary password; the officer should change it on first login.")
    role: UserRole
    rank: PoliceRank
    station: str | None = None
    is_view_only: bool = False


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    badge_number: str
    email: EmailStr
    role: UserRole
    rank: PoliceRank
    is_view_only: bool
    station: str | None = None
    created_by_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def rank_abbreviation(self) -> str:
        """Short form for badge chips ('SP', 'INSP'). Served from the backend
        so the UI never hardcodes a rank vocabulary that could drift."""
        return RANK_ABBREVIATION[self.rank]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def seniority(self) -> int:
        """Numeric rank ordering, so the UI can sort and compare officers
        without reimplementing the hierarchy."""
        return RANK_SENIORITY[self.rank]


class OfficerDirectoryEntry(BaseModel):
    """Roster entry for colleague pickers. Deliberately PII-free."""
    id: uuid.UUID
    full_name: str
    badge_number: str
    rank_abbreviation: str


class RankOption(BaseModel):
    """One entry in the rank vocabulary served to the account-creation UI."""
    value: PoliceRank
    label: str
    abbreviation: str
    seniority: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str
