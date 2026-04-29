from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse


app = FastAPI(title="Sanne Baseten LiveKit Agent Health")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "ok": True,
            "service": "sanne-baseten-livekit-agent",
            "agent": os.getenv("SANNE_AGENT_NAME", "sanne"),
        }
    )
