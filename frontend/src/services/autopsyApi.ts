import { apiRequest } from "@/lib/apiClient";
import type { AutopsyFinding } from "@/types";

export function listAutopsyFindings(caseId: string): Promise<AutopsyFinding[]> {
  return apiRequest<AutopsyFinding[]>(`/autopsy?case_id=${caseId}`);
}

export function confirmAutopsyFinding(id: string, notes?: string): Promise<AutopsyFinding> {
  return apiRequest<AutopsyFinding>(`/autopsy/${id}/confirm`, { method: "POST", body: { notes: notes ?? null } });
}

export function dismissAutopsyFinding(id: string, notes?: string): Promise<AutopsyFinding> {
  return apiRequest<AutopsyFinding>(`/autopsy/${id}/dismiss`, { method: "POST", body: { notes: notes ?? null } });
}
