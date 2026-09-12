"""
Import every model module here. Alembic's env.py imports this package to build
Base.metadata for autogenerate — a model that isn't imported here is invisible
to migrations even though the file exists.
"""
from app.models.analysis import (  # noqa: F401
    AutopsyFinding,
    CaseSimilarityMatch,
    ChargesheetCheck,
    ClosureReadinessScore,
    LocationScore,
    StatementVersion,
)
from app.models.audit import AuditLog  # noqa: F401
from app.models.case import Case, CaseMember  # noqa: F401
from app.models.contradiction import (  # noqa: F401
    Contradiction,
    GuidanceSuggestion,
    LegalKnowledgeBaseEntry,
)
from app.models.evidence import ChainOfCustodyEvent, Evidence  # noqa: F401
from app.models.graph import Entity, EntityRelationship  # noqa: F401
from app.models.ledger import ChainAnchor  # noqa: F401
from app.models.rag import OfflineSyncQueueEntry, RagChunk  # noqa: F401
from app.models.timeline import TimelineEvent  # noqa: F401
from app.models.user import User  # noqa: F401
