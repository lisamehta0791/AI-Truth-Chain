import { apiRequest } from "@/lib/apiClient";

export interface LedgerBlock {
  index: number;
  evidence_id: string;
  description: string | null;
  evidence_type: string;
  uploaded_at: string;
  uploaded_by: string;
  sha256_hash: string;
  previous_hash: string | null;
  recomputed_hash: string | null;
  file_intact: boolean | null;
  link_intact: boolean;
  live_capture_sha256: string | null;
  tamper_drill: boolean;
}

export interface LedgerAnchor {
  id: string;
  head_hash: string;
  chain_digest: string;
  evidence_count: number;
  anchored_at: string;
  anchored_by: string;
  note: string | null;
  holds: boolean;
}

export interface LedgerReport {
  case_id: string;
  evidence_count: number;
  is_valid: boolean;
  broken_at_index: number | null;
  broken_reason: string | null;
  head_hash: string | null;
  chain_digest: string | null;
  files_verified: boolean;
  blocks: LedgerBlock[];
  anchors: LedgerAnchor[];
  tamper_drill_active: boolean;
  verified_at: string;
}

export function getLedger(caseId: string, recomputeFiles = true): Promise<LedgerReport> {
  return apiRequest<LedgerReport>(`/ledger?case_id=${caseId}&recompute_files=${recomputeFiles}`);
}

export function anchorChain(caseId: string, note?: string): Promise<LedgerReport> {
  return apiRequest<LedgerReport>(`/ledger/anchor?case_id=${caseId}`, { method: "POST", body: { note: note ?? null } });
}

export function simulateTamper(caseId: string, index: number): Promise<LedgerReport> {
  return apiRequest<LedgerReport>(`/ledger/simulate-tamper?case_id=${caseId}&index=${index}`, { method: "POST" });
}

export function restoreTamper(caseId: string): Promise<LedgerReport> {
  return apiRequest<LedgerReport>(`/ledger/restore?case_id=${caseId}`, { method: "POST" });
}

export function checkpointUrl(caseId: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
  return `${base}/ledger/checkpoint?case_id=${caseId}`;
}
