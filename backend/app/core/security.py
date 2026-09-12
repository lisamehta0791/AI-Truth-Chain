"""
Password hashing and JWT issuing/verification.

Password hashing uses the `bcrypt` library directly rather than passlib.
passlib 1.7.4 (last released 2020) is incompatible with bcrypt >= 4.1: it
probes the backend with a >72-byte test password, which modern bcrypt rejects
with `ValueError: password cannot be longer than 72 bytes`, so every
hash/verify call raises before it ever reaches our code. Calling bcrypt
directly is a few lines and removes an unmaintained dependency.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()

# bcrypt hashes at most the first 72 bytes of a password and errors on longer
# input. Truncating explicitly keeps behaviour well-defined for long passwords
# instead of raising a 500 at signup/login.
_BCRYPT_MAX_BYTES = 72


def _to_bcrypt_bytes(plain_password: str) -> bytes:
    return plain_password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(_to_bcrypt_bytes(plain_password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bcrypt_bytes(plain_password), hashed_password.encode("utf-8"))
    except ValueError:
        # Malformed/blank stored hash — treat as a failed login, not a 500.
        return False


def create_access_token(subject: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {"sub": subject, "role": role, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {"sub": subject, "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Raises jose.JWTError if invalid/expired — callers translate to HTTP 401."""
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise exc
