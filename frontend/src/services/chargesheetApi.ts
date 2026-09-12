import { apiRequest } from "@/lib/apiClient";
import type { ChargesheetCheck } from "@/types";

export function listChargesheetChecks(caseId: string): Promise<ChargesheetCheck[]> {
  return apiRequest<ChargesheetCheck[]>(`/chargesheet?case_id=${caseId}`);
}

export function runChargesheetQa(caseId: string, chargesheetText: string): Promise<ChargesheetCheck[]> {
  return apiRequest<ChargesheetCheck[]>(`/chargesheet/run`, {
    method: "POST",
    body: { case_id: caseId, chargesheet_text: chargesheetText },
  });
}
