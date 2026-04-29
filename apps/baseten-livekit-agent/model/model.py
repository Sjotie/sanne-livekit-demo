from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any


SECRET_ENV_MAP = {
    "baseten_api_key": "BASETEN_API_KEY",
    "livekit_url": "LIVEKIT_URL",
    "livekit_api_key": "LIVEKIT_API_KEY",
    "livekit_api_secret": "LIVEKIT_API_SECRET",
    "mistral_api_key": "MISTRAL_API_KEY",
}


class Model:
    def __init__(self, **_: Any) -> None:
        self.worker: subprocess.Popen[str] | None = None

    def load(self) -> None:
        self._load_baseten_secrets()
        agent_path = Path(__file__).resolve().parent / "agent_runtime.py"

        env = os.environ.copy()
        env.setdefault("SANNE_AGENT_NAME", "sanne")

        self.worker = subprocess.Popen(
            [sys.executable, str(agent_path), "start"],
            env=env,
            stdout=sys.stdout,
            stderr=sys.stderr,
            text=True,
        )

    def predict(self, model_input: dict[str, Any]) -> dict[str, Any]:
        worker_status = "not_started"
        worker_returncode = None
        if self.worker is not None:
            worker_returncode = self.worker.poll()
            worker_status = "running" if worker_returncode is None else "exited"

        return {
            "ok": worker_status == "running",
            "service": "sanne-baseten-livekit-agent",
            "agent": os.getenv("SANNE_AGENT_NAME", "sanne"),
            "worker_status": worker_status,
            "worker_returncode": worker_returncode,
        }

    def _load_baseten_secrets(self) -> None:
        for secret_name, env_name in SECRET_ENV_MAP.items():
            path = Path("/secrets") / secret_name
            if path.exists() and os.getenv(env_name) in (None, ""):
                os.environ[env_name] = path.read_text().strip()
