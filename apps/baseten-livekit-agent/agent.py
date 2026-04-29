from __future__ import annotations

from livekit import agents

from model.agent_runtime import server


if __name__ == "__main__":
    agents.cli.run_app(server)
