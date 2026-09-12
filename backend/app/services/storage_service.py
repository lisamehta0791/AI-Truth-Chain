"""
S3-compatible object storage abstraction (PDF requirement: evidence files must
not be stored as arbitrary blobs inside application code). Points at MinIO for
local dev and can point at real AWS S3 in production by changing only
S3_ENDPOINT_URL in .env — nothing in this file or its callers needs to change.
"""
import uuid

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import get_settings

settings = get_settings()


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=BotoConfig(signature_version="s3v4"),
    )


def ensure_bucket_exists() -> None:
    """Idempotent — safe to call on every app startup / first use."""
    client = _client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket_name)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket_name)


def build_object_key(case_id: uuid.UUID, evidence_id: uuid.UUID, original_filename: str | None) -> str:
    """
    Deterministic, collision-free key layout: case/evidence hierarchy makes it
    trivial to reason about access control and bucket browsing per case.
    """
    safe_name = (original_filename or "evidence").replace("/", "_").replace("\\", "_")
    return f"cases/{case_id}/evidence/{evidence_id}/{safe_name}"


def upload_bytes(key: str, data: bytes, content_type: str | None = None) -> str:
    ensure_bucket_exists()
    _client().put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type or "application/octet-stream",
    )
    return key


def download_bytes(key: str) -> bytes:
    response = _client().get_object(Bucket=settings.s3_bucket_name, Key=key)
    return response["Body"].read()


def generate_presigned_download_url(key: str, expires_in_seconds: int = 300) -> str:
    """
    Used instead of streaming raw bytes through the API for large evidence
    files (video/CCTV) — the frontend fetches directly from storage with a
    short-lived signed URL, and every issuance of a URL is itself audit-logged
    by the calling route.
    """
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": key},
        ExpiresIn=expires_in_seconds,
    )
