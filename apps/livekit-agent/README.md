# Sanne LiveKit Agent

Minimal LiveKit worker that joins rooms when the web layer dispatches `agent_name=sanne`.

This is the first working voice loop:

```text
Browser -> LiveKit room -> Sanne LiveKit worker -> Mistral STT/LLM/TTS
```

Baseten/OmniVoice will replace or augment the STT/LLM/TTS pieces after the media loop is proven.

## Required Env

Loaded from repo-root `.env`:

```bash
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
MISTRAL_API_KEY=...
```

## Run

```bash
uv run --directory apps/livekit-agent python agent.py dev
```

Keep this running while the web layer is open at `http://127.0.0.1:3007`.
