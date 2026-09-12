import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.rag import RagChunk


def insert_chunk(db: Session, chunk: RagChunk) -> RagChunk:
    db.add(chunk)
    db.commit()
    db.refresh(chunk)
    return chunk


def similarity_search(
    db: Session,
    *,
    query_embedding: list[float],
    case_id: uuid.UUID | None,
    source_type: str | None,
    top_k: int = 6,
) -> list[RagChunk]:
    """
    Cosine-distance nearest-neighbor search via pgvector's `<=>` operator.
    `case_id=None` with `source_type="legal_kb"` searches the shared legal
    corpus; `case_id` set restricts retrieval to one case's own evidence
    chunks, so a case's facts never leak into another case's context.
    """
    stmt = select(RagChunk).order_by(RagChunk.embedding.cosine_distance(query_embedding)).limit(top_k)
    if case_id is not None:
        stmt = stmt.where(RagChunk.case_id == case_id)
    if source_type is not None:
        stmt = stmt.where(RagChunk.source_type == source_type)
    return list(db.scalars(stmt))
