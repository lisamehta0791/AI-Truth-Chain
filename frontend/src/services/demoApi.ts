import { apiRequest } from "@/lib/apiClient";

export interface ScenarioStage {
  key: string;
  title: string;
  narration: string;
  item_count: number;
  loaded: boolean;
}

export interface ScenarioStatus {
  case_id: string;
  stages: ScenarioStage[];
  loaded_count: number;
  total: number;
  next_stage_key: string | null;
  complete: boolean;
  /** True for the scenario's own case (the Riverside file); related cases are not driven by the strip. */
  primary: boolean;
}

export function getScenario(caseId: string): Promise<ScenarioStatus> {
  return apiRequest<ScenarioStatus>(`/demo/scenario?case_id=${caseId}`);
}

/** Ingests the next stage's evidence through the real pipeline. Slow: it runs the AI. */
export function loadNextStage(caseId: string): Promise<ScenarioStatus & { stage: string; title: string }> {
  return apiRequest(`/demo/scenario/next?case_id=${caseId}`, { method: "POST" });
}

export function loadAllStages(caseId: string): Promise<ScenarioStatus> {
  return apiRequest(`/demo/scenario/all?case_id=${caseId}`, { method: "POST" });
}

export function resetScenario(caseId: string): Promise<ScenarioStatus & { removed_evidence: number }> {
  return apiRequest(`/demo/scenario/reset?case_id=${caseId}`, { method: "POST" });
}
