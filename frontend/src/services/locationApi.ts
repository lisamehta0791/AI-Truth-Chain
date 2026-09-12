import { apiRequest } from "@/lib/apiClient";
import type { LocationScore } from "@/types";

export function listLocationScores(caseId: string): Promise<LocationScore[]> {
  return apiRequest<LocationScore[]>(`/location?case_id=${caseId}`);
}

export function computeLocationScores(caseId: string): Promise<LocationScore[]> {
  return apiRequest<LocationScore[]>(`/location/compute?case_id=${caseId}`, { method: "POST" });
}
