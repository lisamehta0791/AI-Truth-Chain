import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.security import decode_token
from app.core.websocket_manager import manager
from app.db.session import SessionLocal
from app.repositories import user_repository

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/case/{case_id}")
async def case_event_stream(websocket: WebSocket, case_id: uuid.UUID, token: str = Query(...)) -> None:
    """
    Browsers cannot set an Authorization header on a WebSocket handshake, so
    the access token is passed as a query parameter instead and validated
    exactly like the HTTP dependency in core/deps.py before the connection is
    accepted. Every confirm/dismiss/upload elsewhere in the app broadcasts
    through `manager` to every client connected here for the same case_id —
    this is what makes "one upload triggers reactions across the app" work
    for the live demo.
    """
    db = SessionLocal()
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4401)
            return
        user = user_repository.get_by_id(db, uuid.UUID(payload["sub"]))
        if user is None or not user.is_active:
            await websocket.close(code=4401)
            return
    except (JWTError, ValueError, KeyError):
        await websocket.close(code=4401)
        return
    finally:
        db.close()

    await manager.connect(case_id, websocket)
    try:
        while True:
            # The client doesn't need to send anything — this just keeps the
            # connection open and lets us detect disconnects promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(case_id, websocket)
