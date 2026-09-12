import { apiRequest } from "@/lib/apiClient";
import type { Contradiction } from "@/types";

export function listContradictions(caseId: string): Promise<Contradiction[]> {
  return apiRequest<Contradiction[]>(`/contradictions?case_id=${caseId}`);
}

export function confirmContradiction(id: string, notes?: string): Promise<Contradiction> {
  return apiRequest<Contradiction>(`/contradictions/${id}/confirm`, { method: "POST", body: { notes: notes ?? null } });
}

export function dismissContradiction(id: string, notes?: string): Promise<Contradiction> {
  return apiRequest<Contradiction>(`/contradictions/${id}/dismiss`, { method: "POST", body: { notes: notes ?? null } });
}

export function requestReviewContradiction(id: string, notes?: string): Promise<Contradiction> {
  return apiRequest<Contradiction>(`/contradictions/${id}/request-review`, {
    method: "POST",
    body: { notes: notes ?? null },
  });
}
