#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8000}"

uv run python -m uvicorn health_server:app --host 0.0.0.0 --port "$PORT" &
HEALTH_PID=$!

cleanup() {
  kill "$HEALTH_PID" 2>/dev/null || true
}
trap cleanup EXIT

uv run python agent.py start
