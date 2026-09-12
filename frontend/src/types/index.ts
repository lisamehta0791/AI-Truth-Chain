/** WHAT an officer does on a case. Mirrors backend models/user.py::UserRole. */
export type UserRole =
  | "investigating_officer"
  | "supervisor"
  | "forensic_reviewer"
  | "legal_reviewer";

/**
 * HOW SENIOR an officer is — the Indian state police / commissionerate ladder.
 * Mirrors backend models/user.py::PoliceRank. Never infer ordering from this
 * union's declaration order in permission logic; use `User.seniority`, which
 * the backend computes, so the two can never drift.
 */
export type PoliceRank =
  | "constable"
  | "head_constable"
  | "assistant_sub_inspector"
  | "sub_inspector"
  | "inspector"
  | "deputy_superintendent"
  | "superintendent"
  | "deputy_inspector_general"
  | "inspector_general"
  | "commissioner"
  | "director_general";

export interface User {
  id: string;
  full_name: string;
  badge_number: string;
  email: string;
  role: UserRole;
  rank: PoliceRank;
  /** Short form for badge chips ("SP", "INSP") — served by the backend. */
  rank_abbreviation: string;
  /** Numeric rank ordering, computed server-side. Higher = more senior. */
  seniority: number;
  /** Oversight account: may read at its clearance, may never write. */
  is_view_only: boolean;
  station: string | null;
  created_by_id: string | null;
  is_active: boolean;
  created_at: string;
}

/** Roster entry from GET /users/directory — name, badge and rank only. */
export interface OfficerDirectoryEntry {
  id: string;
  full_name: string;
  badge_number: string;
  rank_abbreviation: string;
}

/** One provisionable rank, as offered by GET /users/ranks. */
export interface RankOption {
  value: PoliceRank;
  label: string;
  abbreviation: string;
  seniority: number;
}

/**
 * Rank thresholds, mirroring backend core/permissions.py. These drive UI
 * affordances ONLY — every one of them is enforced server-side as well, and
 * the server is the authority. Hiding a button is a courtesy, not a control.
 */
export const MIN_SENIORITY = {
  CONFIRM_AI_OUTPUT: 40, // sub_inspector
  VIEW_PII: 40, // sub_inspector
  VIEW_AUDIT_LOG: 50, // inspector
  MANAGE_ACCOUNTS: 60, // deputy_superintendent
  CROSS_CASE_VIEW: 70, // superintendent
} as const;

/** Field ranks must supply a live camera capture when logging evidence. */
export const FIELD_RANKS: readonly PoliceRank[] = [
  "constable",
  "head_constable",
  "assistant_sub_inspector",
];

export function canConfirmAiOutput(user: User | null): boolean {
  return !!user && !user.is_view_only && user.seniority >= MIN_SENIORITY.CONFIRM_AI_OUTPUT;
}

export function canManageAccounts(user: User | null): boolean {
  return !!user && !user.is_view_only && user.seniority >= MIN_SENIORITY.MANAGE_ACCOUNTS;
}

export function canViewAuditLog(user: User | null): boolean {
  return !!user && user.seniority >= MIN_SENIORITY.VIEW_AUDIT_LOG;
}

export function requiresLiveCapture(user: User | null): boolean {
  return !!user && FIELD_RANKS.includes(user.rank);
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export type CaseStatus = "open" | "under_review" | "chargesheet_filed" | "closed";

export interface Case {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  status: CaseStatus;
  created_by: string;
  created_at: string;
}

/**
 * The single verification-status union used everywhere an AI claim meets a
 * human decision. Mirrors backend app/models/timeline.py::VerificationStatus —
 * keep these two in sync by hand until a shared schema generator is added.
 */
export type VerificationStatus =
  | "verified"
  | "ai_extracted_unverified"
  | "ai_hypothesis"
  | "human_confirmed"
  | "dismissed"
  | "requires_review";

export type EvidenceType =
  | "photo"
  | "video"
  | "audio"
  | "document"
  | "statement"
  | "forensic_report"
  | "autopsy_report"
  | "cctv_metadata"
  | "phone_record"
  | "gps_log"
  | "seized_item";

export type EvidenceStatus = "pending_confirmation" | "logged" | "ai_processed" | "flagged";

export interface Evidence {
  id: string;
  case_id: string;
  evidence_type: EvidenceType;
  status: EvidenceStatus;
  uploaded_by: string;
  witness_officer_id: string | null;
  storage_key: string | null;
  original_filename: string | null;
  device_metadata: Record<string, unknown> | null;
  captured_at: string | null;
  uploaded_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  sha256_hash: string;
  previous_hash: string | null;
  description: string | null;
  language: string | null;
  /** Proof-of-presence capture hash, when one was supplied. */
  live_capture_sha256: string | null;
  live_capture_at: string | null;
}

export type CustodyAction =
  | "collected"
  | "witness_confirmed"
  | "hash_logged"
  | "viewed"
  | "transferred"
  | "ai_processed"
  | "synced_from_offline";

export interface ChainOfCustodyEvent {
  id: string;
  evidence_id: string;
  actor_id: string;
  action: CustodyAction;
  hash_at_event: string | null;
  notes: string | null;
  occurred_at: string;
}

export interface ChainIntegrityReport {
  case_id: string;
  is_valid: boolean;
  broken_at_index: number | null;
  evidence_count: number;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  source_evidence_id: string | null;
  event_time: string;
  event_type: string;
  description: string;
  verification_status: VerificationStatus;
  confidence: number | null;
  extracted_entities: { entities: { type: string; name: string; attributes: Record<string, unknown> }[] } | null;
  source_excerpt: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export type Severity = "minor" | "major";

export interface Contradiction {
  id: string;
  case_id: string;
  evidence_a_id: string;
  evidence_b_id: string;
  severity: Severity;
  confidence: number;
  explanation: string;
  status: VerificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Shape of every message broadcast over the case WebSocket — see backend core/websocket_manager.py callers. */
export type CaseWsEvent =
  | { type: "evidence.logged"; evidence_id: string; evidence_type: string; sha256_hash: string; status: string }
  | { type: "evidence.witness_confirmed"; evidence_id: string }
  | { type: "evidence.ai_processed"; evidence_id: string; events_extracted: number }
  // Emitted when the evidence was logged and hashed successfully but the AI
  // stage produced nothing (no API key configured, provider outage, bad model
  // output). The UI must show this as "AI analysis unavailable", never as
  // "no contradictions found" — an absent flag is not a clean bill of health.
  | { type: "evidence.ai_skipped"; evidence_id: string; reason: string }
  | { type: "timeline.event_extracted"; event_id: string; description: string; confidence: number | null; source_evidence_id: string }
  | { type: "timeline.event_confirmed"; event_id: string; confirmed_by: string }
  | { type: "contradiction.flagged"; contradiction_id: string; severity: Severity; confidence: number; explanation: string }
  | { type: "contradiction.reviewed"; contradiction_id: string; outcome: VerificationStatus; reviewed_by: string }
  | { type: "guidance.suggested"; guidance_id: string; suggestion: string; legal_reference: string; confidence: number }
  | { type: "guidance.reviewed"; guidance_id: string; outcome: VerificationStatus }
  | { type: "location.updated"; regions_scored: number }
  | { type: "autopsy.finding_added"; finding_id: string; finding_type: string; body_region: string | null; confidence: number }
  | { type: "autopsy.reviewed"; finding_id: string; outcome: VerificationStatus }
  | { type: "chargesheet.checked"; total_claims: number; conflicts: number };

export interface StatementVersion {
  id: string;
  evidence_id: string;
  version_no: number;
  text: string;
  language: string;
  diff_from_previous: string | null;
  recorded_at: string;
}

export type EntityType =
  | "person"
  | "officer"
  | "doctor"
  | "suspect"
  | "witness"
  | "location"
  | "event"
  | "evidence"
  | "document"
  | "device";

export type RelationType = "supports" | "contradicts" | "mentions" | "related_to" | "located_at" | "derived_from";

export interface GraphEntity {
  id: string;
  entity_type: EntityType;
  name: string;
  attributes: Record<string, unknown> | null;
}

export interface GraphRelationship {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relation_type: RelationType;
  source_evidence_id: string | null;
}

export interface CaseGraph {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

export interface ClosureReadinessScore {
  id: string;
  case_id: string;
  score: number;
  factors: {
    evidence_count: number;
    unverified_timeline_events: number;
    open_contradictions: number;
    pending_guidance_items: number;
    hash_chain_valid: boolean;
    method: string;
  };
  computed_at: string;
}

export interface CaseSimilarityMatch {
  id: string;
  case_id: string;
  matched_case_id: string;
  similarity_score: number;
  matched_factors: {
    shared_entities: string[];
    shared_evidence_types: string[];
    method: string;
  };
}

export interface OfflineSyncQueueEntry {
  id: string;
  device_id: string;
  payload: Record<string, unknown>;
  original_timestamp: string;
  original_hash: string;
  synced_at: string | null;
  created_at: string;
}

export interface GuidanceSuggestion {
  id: string;
  case_id: string;
  triggered_by_evidence_id: string | null;
  suggestion: string;
  legal_reference: string;
  confidence: number;
  status: VerificationStatus;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  case_id: string | null;
  metadata_json: Record<string, unknown> | null;
  result: string;
  timestamp: string;
}

export interface LocationScore {
  id: string;
  case_id: string;
  gps_lat: number;
  gps_lng: number;
  score: number;
  explanation: {
    recency_weight: number;
    reliability_weight: number;
    evidence_count: number;
    evidence_ids: string[];
    method: string;
  };
  computed_at: string;
}

export interface AutopsyFinding {
  id: string;
  case_id: string;
  source_evidence_id: string;
  finding_type: string;
  body_region: string | null;
  ai_hypothesis: string;
  confidence: number;
  requires_review: boolean;
  status: VerificationStatus;
  created_at: string;
}

export type ChargesheetCheckStatus = "pass" | "warning" | "conflict" | "missing_support";

export interface ChargesheetCheck {
  id: string;
  case_id: string;
  claim_text: string;
  status: ChargesheetCheckStatus;
  linked_evidence_ids: string[] | null;
  created_at: string;
}
