import { getAccessToken } from "@/lib/session";
import { useEffect, useRef } from "react";

import type { CaseWsEvent } from "@/types";

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000/api/v1/ws";

/**
 * Opens one WebSocket per case and re-opens it if the case changes. The
 * token is passed as a query param because browsers can't set an
 * Authorization header on a WS handshake — see backend api/v1/ws.py.
 */
export function useCaseWebSocket(caseId: string | null, onEvent: (event: CaseWsEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!caseId) return;
    const token = getAccessToken();
    if (!token) return;

    const socket = new WebSocket(`${WS_BASE_URL}/case/${caseId}?token=${token}`);

    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as CaseWsEvent;
        onEventRef.current(parsed);
      } catch {
        // Ignore malformed frames rather than crashing the UI.
      }
    };

    return () => socket.close();
  }, [caseId]);
}
