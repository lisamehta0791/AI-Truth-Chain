import { apiRequest } from "@/lib/apiClient";

export interface CopilotAnswer {
  answer: string;
  citations: string[];
  confidence: number;
  gaps: string[];
  ai_unavailable: boolean;
}

export function suggestedQuestions(): Promise<string[]> {
  return apiRequest<string[]>("/copilot/suggestions");
}

export function ask(caseId: string, question: string): Promise<CopilotAnswer> {
  return apiRequest<CopilotAnswer>("/copilot/ask", { method: "POST", body: { case_id: caseId, question } });
}
