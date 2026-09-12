import { apiRequest } from "@/lib/apiClient";
import type { Case } from "@/types";

export function listMyCases(): Promise<Case[]> {
  return apiRequest<Case[]>("/cases");
}

export function getCase(caseId: string): Promise<Case> {
  return apiRequest<Case>(`/cases/${caseId}`);
}

export function createCase(data: { case_number: string; title: string; description?: string }): Promise<Case> {
  return apiRequest<Case>("/cases", { method: "POST", body: data });
}
