import { getAccessToken } from "@/lib/session";
import { apiRequest } from "@/lib/apiClient";
import type { ChainIntegrityReport, ChainOfCustodyEvent, Evidence, EvidenceType } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UploadEvidencePayload {
  case_id: string;
  evidence_type: EvidenceType;
  file: File;
  witness_officer_id?: string;
  device_metadata?: Record<string, unknown>;
  captured_at?: string;
  gps_lat?: number;
  gps_lng?: number;
  description?: string;
  language?: string;
  text_content?: string;
  /** Proof-of-presence photo. Mandatory for field ranks (see requiresLiveCapture). */
  live_capture?: Blob | null;
}

/**
 * Multipart upload — bypasses the shared JSON apiRequest wrapper since file
 * uploads need FormData, not a JSON body.
 */
export async function uploadEvidence(payload: UploadEvidencePayload): Promise<Evidence> {
  const form = new FormData();
  form.append("case_id", payload.case_id);
  form.append("evidence_type", payload.evidence_type);
  form.append("file", payload.file);
  if (payload.witness_officer_id) form.append("witness_officer_id", payload.witness_officer_id);
  if (payload.device_metadata) form.append("device_metadata", JSON.stringify(payload.device_metadata));
  if (payload.captured_at) form.append("captured_at", payload.captured_at);
  if (payload.gps_lat !== undefined) form.append("gps_lat", String(payload.gps_lat));
  if (payload.gps_lng !== undefined) form.append("gps_lng", String(payload.gps_lng));
  if (payload.description) form.append("description", payload.description);
  if (payload.language) form.append("language", payload.language);
  // text_content drives the entire AI pipeline (extraction -> timeline ->
  // contradiction detection). It was previously accepted by this function's
  // type but never appended to the FormData, so every upload made from the UI
  // silently reached the backend with no readable text and no AI stage ever
  // ran — the API worked, the UI just never sent the field.
  if (payload.text_content) form.append("text_content", payload.text_content);
  if (payload.live_capture) form.append("live_capture", payload.live_capture, "live-capture.jpg");

  const response = await fetch(`${API_BASE_URL}/evidence`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? "Evidence upload failed");
  }
  return response.json();
}

export function confirmWitness(evidenceId: string, notes?: string): Promise<Evidence> {
  return apiRequest<Evidence>(`/evidence/${evidenceId}/confirm-witness`, {
    method: "POST",
    body: { notes: notes ?? null },
  });
}

export function listEvidenceForCase(caseId: string): Promise<Evidence[]> {
  return apiRequest<Evidence[]>(`/evidence?case_id=${caseId}`);
}

export function getEvidence(evidenceId: string): Promise<Evidence> {
  return apiRequest<Evidence>(`/evidence/${evidenceId}`);
}

export function getChainOfCustody(evidenceId: string): Promise<ChainOfCustodyEvent[]> {
  return apiRequest<ChainOfCustodyEvent[]>(`/evidence/${evidenceId}/chain`);
}

export function getDownloadUrl(evidenceId: string): Promise<{ url: string; expires_in_seconds: number }> {
  return apiRequest(`/evidence/${evidenceId}/download-url`);
}

export function checkChainIntegrity(caseId: string): Promise<ChainIntegrityReport> {
  return apiRequest<ChainIntegrityReport>(`/evidence/case/${caseId}/chain-integrity`);
}
