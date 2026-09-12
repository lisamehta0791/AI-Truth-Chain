import { apiRequest } from "@/lib/apiClient";
import type { OfflineSyncQueueEntry } from "@/types";

export function getSyncStatus(deviceId: string): Promise<OfflineSyncQueueEntry[]> {
  return apiRequest<OfflineSyncQueueEntry[]>(`/sync/status?device_id=${encodeURIComponent(deviceId)}`);
}

export function submitOfflineBatch(
  deviceId: string,
  entries: { payload: Record<string, unknown>; original_timestamp: string; original_hash: string }[]
): Promise<OfflineSyncQueueEntry[]> {
  return apiRequest<OfflineSyncQueueEntry[]>(`/sync/offline-batch`, {
    method: "POST",
    body: { device_id: deviceId, entries },
  });
}
