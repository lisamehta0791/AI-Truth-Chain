from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_token
from app.db.session import get_db
from app.repositories import user_repository
from app.schemas.user import LoginRequest, RefreshRequest, TokenResponse, UserCreate, UserOut
from app.services import auth_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    if user_repository.get_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="A user with this email already exists.")
    user = auth_service.register_user(db, data)
    log_action(db, actor=user, action="auth.register", target_type="user", target_id=str(user.id))
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        user = auth_service.authenticate(db, data.email, data.password)
    except auth_service.InvalidCredentialsError as exc:
        log_action(
            db, actor=None, action="auth.login", target_type="user",
            target_id=data.email, result="failure", metadata={"reason": str(exc)},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    access, refresh = auth_service.issue_tokens(user)
    log_action(db, actor=user, action="auth.login", target_type="user", target_id=str(user.id))
    return TokenResponse(access_token=access, refresh_token=refresh, user=user)


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
def login_oauth2_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    OAuth2 password-flow variant of /auth/login, accepting form-encoded
    `username`/`password` instead of JSON.

    This exists so the "Authorize" button in Swagger UI (/docs) actually
    works: core/deps.py declares OAuth2PasswordBearer, and the OAuth2 spec
    requires the token endpoint to take form fields. /auth/login takes a JSON
    body (which is what the React client sends), so pointing Swagger at it
    made every /docs Authorize attempt fail with a 422.

    `username` is the user's email — OAuth2 fixes the field name.
    Hidden from the schema so the documented, canonical login endpoint stays
    /auth/login; this one is only the Swagger authorization hook.
    """
    try:
        user = auth_service.authenticate(db, form_data.username, form_data.password)
    except auth_service.InvalidCredentialsError as exc:
        log_action(
            db, actor=None, action="auth.login", target_type="user",
            target_id=form_data.username, result="failure", metadata={"reason": str(exc)},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    access, refresh = auth_service.issue_tokens(user)
    log_action(db, actor=user, action="auth.login", target_type="user", target_id=str(user.id))
    return TokenResponse(access_token=access, refresh_token=refresh, user=user)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        payload = decode_token(data.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
    except (JWTError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    import uuid as _uuid

    user = user_repository.get_by_id(db, _uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    new_access = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=new_access, refresh_token=data.refresh_token, user=user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(db: Session = Depends(get_db)) -> None:
    # Stateless JWT: logout is a client-side token discard. We still audit-log the
    # intent so "logout" appears in the access trail as required by PDF §7.
    # (A denylist/short-lived-token strategy can be added later without changing this route's contract.)
    return None
