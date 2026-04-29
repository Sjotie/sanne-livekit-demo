from __future__ import annotations

import base64
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse


app = FastAPI(title="Sanne Baseten Agent")


@dataclass
class SessionState:
    session_id: str
    voice_id: str
    started_at: float = field(default_factory=time.time)
    audio_chunks: list[bytes] = field(default_factory=list)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"ok": True, "service": "sanne-baseten-agent"})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    state: SessionState | None = None

    try:
        while True:
            raw_message = await websocket.receive_text()
            message = parse_message(raw_message)
            message_type = message.get("type")

            if message_type == "session.start":
                state = SessionState(
                    session_id=str(message.get("sessionId") or "local-demo"),
                    voice_id=str(
                        message.get("voiceId")
                        or os.getenv("SANNE_AGENT_VOICE_ID")
                        or "voice_Sanne_20260413101430"
                    ),
                )
                await send_event(websocket, "session.ready", sessionId=state.session_id)

            elif message_type == "audio.chunk":
                if state is None:
                    await send_event(websocket, "error", message="Start a session before sending audio.")
                    continue
                encoded = message.get("data")
                if isinstance(encoded, str) and encoded:
                    state.audio_chunks.append(base64.b64decode(encoded))
                await send_event(websocket, "audio.received", chunks=len(state.audio_chunks))

            elif message_type == "audio.stop":
                if state is None:
                    await send_event(websocket, "error", message="No active session.")
                    continue
                await run_mock_turn(websocket, state)
                state.audio_chunks.clear()

            elif message_type == "session.end":
                await send_event(websocket, "session.ended")
                await websocket.close()
                return

            else:
                await send_event(websocket, "error", message=f"Unknown message type: {message_type}")

    except WebSocketDisconnect:
        return


def parse_message(raw_message: str) -> dict[str, Any]:
    try:
        message = json.loads(raw_message)
    except json.JSONDecodeError:
        return {"type": "invalid"}
    return message if isinstance(message, dict) else {"type": "invalid"}


async def send_event(websocket: WebSocket, event_type: str, **payload: Any) -> None:
    await websocket.send_text(json.dumps({"type": event_type, **payload}))


async def run_mock_turn(websocket: WebSocket, state: SessionState) -> None:
    await send_event(websocket, "transcript.partial", text="Ik hoorde je vraag...")
    await send_event(websocket, "transcript.final", text="Kun je jezelf kort voorstellen?")
    await send_event(websocket, "agent.thinking")

    response = (
        "Ik ben de eerste Sanne-agent. Mijn echte stem en lage-latency pipeline "
        "komen straks uit de Baseten runtime met OmniVoice."
    )
    await send_event(websocket, "agent.text", text=response, voiceId=state.voice_id)
    await send_event(websocket, "audio.done")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
