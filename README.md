# Sanne Demo

Local setup for the `pikastream-video-meeting` Codex skill.

## Setup

The real Pika developer key lives in `.env`, which is intentionally ignored by git.

Install the Python dependency with uv:

```bash
uv venv
uv pip install -r requirements.txt
```

Run the installed Pika skill through the local wrapper:

```bash
./scripts/pika-meeting join --meet-url "<google-meet-or-zoom-url>" --bot-name "Sanne"
```

## LiveKit Voice Loop

Start the web layer:

```bash
bun run --cwd apps/livekit-web dev
```

For local-only testing, start the temporary LiveKit agent worker:

```bash
uv run --directory apps/livekit-agent python agent.py dev
```

Open `http://127.0.0.1:3007`, connect to the room, and turn on the mic.

## Baseten Worker

The deployable Baseten worker lives in `apps/baseten-livekit-agent`.

```bash
uv sync --directory apps/baseten-livekit-agent
uv run --directory apps/baseten-livekit-agent pytest
```

It runs as LiveKit agent `sanne` and uses Baseten Model API for the LLM when `SANNE_LLM_PROVIDER=baseten` and `BASETEN_LLM_MODEL` are set.

Current Baseten production:

- Model ID: `qjd0lvpq`
- Deployment ID: `31dpkpr`
- Health: `https://model-qjd0lvpq.api.baseten.co/production/predict`
- Stack: LiveKit media -> Baseten-hosted worker -> Baseten LLM -> Mistral STT/TTS fallback

Deploy with Truss:

```bash
truss push apps/baseten-livekit-agent --wait --promote --deployment-name sanne-livekit-agent
```
