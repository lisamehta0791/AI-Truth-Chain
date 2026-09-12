import { apiRequest } from "@/lib/apiClient";
import type { TimelineEvent } from "@/types";

export function listTimeline(caseId: string): Promise<TimelineEvent[]> {
  return apiRequest<TimelineEvent[]>(`/timeline?case_id=${caseId}`);
}

export function confirmTimelineEvent(eventId: string, notes?: string): Promise<TimelineEvent> {
  return apiRequest<TimelineEvent>(`/timeline/${eventId}/confirm`, {
    method: "POST",
    body: { notes: notes ?? null },
  });
}
