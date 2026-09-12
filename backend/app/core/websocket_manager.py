import uuid

from fastapi import WebSocket


class ConnectionManager:
    """
    Tracks active WebSocket connections per case. A single case can have
    multiple connected clients (e.g. the officer's laptop and the stage
    demo projector) — all of them receive every broadcast for that case.
    """

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = {}

    async def connect(self, case_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(case_id, []).append(websocket)

    def disconnect(self, case_id: uuid.UUID, websocket: WebSocket) -> None:
        connections = self._connections.get(case_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections and case_id in self._connections:
            del self._connections[case_id]

    async def broadcast(self, case_id: uuid.UUID, event: dict) -> None:
        """Best-effort — a dead socket is dropped rather than raising, so one
        stale client can't break the pipeline for everyone else."""
        dead: list[WebSocket] = []
        for connection in self._connections.get(case_id, []):
            try:
                await connection.send_json(event)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(case_id, connection)


manager = ConnectionManager()
