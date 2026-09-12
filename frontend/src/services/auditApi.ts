import { apiRequest } from "@/lib/apiClient";
import type { AuditLogEntry } from "@/types";

export function listAuditLog(caseId: string): Promise<AuditLogEntry[]> {
  return apiRequest<AuditLogEntry[]>(`/audit?case_id=${caseId}`);
}
