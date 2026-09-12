import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.case import Case
from app.models.user import User

# Points at /auth/token, not /auth/login: OAuth2 requires a form-encoded
# token endpoint, and /auth/login takes JSON (what the React client sends).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_error
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except JWTError:
        raise credentials_error from None

    user = db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise credentials_error
    return user


def verified_case_id(case_id: uuid.UUID, db: Session = Depends(get_db)) -> uuid.UUID:
    """
    Query-parameter dependency for every case-scoped endpoint: resolves
    `?case_id=` and 404s if that case does not exist.

    Without this, an unknown case_id sailed through to the repository (which
    returned an empty list) and then to audit_service.log_action, whose INSERT
    carries case_id as a FOREIGN KEY. The FK violation surfaced as a bare HTTP
    500, so a stale case id in the URL or in the frontend's saved state broke
    every page in the app with no usable error.
    """
    if db.get(Case, case_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case {case_id} not found",
        )
    return case_id
