import { apiRequest } from "@/lib/apiClient";
import type { GuidanceSuggestion } from "@/types";

export function listGuidance(caseId: string): Promise<GuidanceSuggestion[]> {
  return apiRequest<GuidanceSuggestion[]>(`/guidance?case_id=${caseId}`);
}

export function acknowledgeGuidance(id: string, notes?: string): Promise<GuidanceSuggestion> {
  return apiRequest<GuidanceSuggestion>(`/guidance/${id}/acknowledge`, {
    method: "POST",
    body: { notes: notes ?? null },
  });
}

export function dismissGuidance(id: string, notes?: string): Promise<GuidanceSuggestion> {
  return apiRequest<GuidanceSuggestion>(`/guidance/${id}/dismiss`, {
    method: "POST",
    body: { notes: notes ?? null },
  });
}
