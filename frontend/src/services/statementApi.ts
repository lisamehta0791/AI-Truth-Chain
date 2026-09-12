import { apiRequest } from "@/lib/apiClient";
import type { StatementVersion } from "@/types";

export function listStatementVersions(evidenceId: string): Promise<StatementVersion[]> {
  return apiRequest<StatementVersion[]>(`/statements/${evidenceId}`);
}

export function addStatementVersion(evidenceId: string, text: string, language = "en"): Promise<StatementVersion> {
  return apiRequest<StatementVersion>(`/statements`, {
    method: "POST",
    body: { evidence_id: evidenceId, text, language },
  });
}
