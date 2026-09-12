import { apiRequest } from "@/lib/apiClient";
import type { ClosureReadinessScore } from "@/types";

export function getClosureReadiness(caseId: string): Promise<ClosureReadinessScore> {
  return apiRequest<ClosureReadinessScore>(`/closure-score?case_id=${caseId}`);
}
