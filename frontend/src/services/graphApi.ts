import { apiRequest } from "@/lib/apiClient";
import type { CaseGraph } from "@/types";

export function getCaseGraph(caseId: string): Promise<CaseGraph> {
  return apiRequest<CaseGraph>(`/graph?case_id=${caseId}`);
}
