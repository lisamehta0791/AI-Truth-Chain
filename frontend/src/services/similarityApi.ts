import { apiRequest } from "@/lib/apiClient";
import type { CaseSimilarityMatch } from "@/types";

export function findSimilarCases(caseId: string): Promise<CaseSimilarityMatch[]> {
  return apiRequest<CaseSimilarityMatch[]>(`/case-similarity?case_id=${caseId}`);
}

export interface CaseProfile {
  id: string;
  case_number: string;
  title: string;
  status: string;
  opened_at: string | null;
  evidence_count: number;
  evidence_types: string[];
  event_count: number;
  first_seen: string | null;
  last_seen: string | null;
  people: string[];
  places: string[];
  signals: string[];
  plates: string[];
  key_events: Array<{ time: string; description: string; status: string }>;
}

export interface CaseComparison {
  a: CaseProfile;
  b: CaseProfile;
  score: number;
  verdict: string;
  shared_entities: Array<{ name: string; type: string; type_in_other: string }>;
  shared_places: Array<{ a: string; b: string; distance_m: number; lat: number; lng: number }>;
  shared_signals: string[];
  shared_plates: string[];
  shared_evidence_types: string[];
  gap_days: number | null;
  method: string;
}

/** Side-by-side comparison — "has this happened before?" */
export function compareCases(caseId: string, otherId: string): Promise<CaseComparison> {
  return apiRequest<CaseComparison>(`/case-similarity/compare?case_id=${caseId}&other_id=${otherId}`);
}
