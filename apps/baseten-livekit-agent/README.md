# Sanne Baseten LiveKit Agent

Deployable runtime for the Sanne voice agent. This keeps LiveKit as the WebRTC/media layer and moves the agent process to Baseten.

Current state:

```text
Browser -> LiveKit room -> Baseten-hosted LiveKit worker -> provider adapters
```

Provider adapters:

- VAD / endpointing: local in the worker with Silero. LiveKit multilingual turn detection is optional via `SANNE_TURN_DETECTOR=true`, but disabled by default on Baseten to avoid shipping the ONNX turn-detector model in the demo image.
- LLM: Baseten Model API when `SANNE_LLM_PROVIDER=baseten`, otherwise Mistral fallback.
- STT/TTS: Mistral fallback for the first deploy. Baseten STT and OmniVoice TTS need concrete Baseten model/deployment IDs before wiring.

Production deployment:

- Model ID: `qjd0lvpq`
- Production deployment ID: `31dpkpr`
- Health endpoint: `https://model-qjd0lvpq.api.baseten.co/production/predict`

## Required Env

These are loaded from Baseten secrets/environment variables:

```bash
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
BASETEN_API_KEY=...

SANNE_AGENT_NAME=sanne
SANNE_LLM_PROVIDER=baseten
BASETEN_LLM_MODEL=...
SANNE_TURN_DETECTOR=false

# Temporary fallback until Baseten STT/TTS deployments are ready:
MISTRAL_API_KEY=...
```

## Local Run

```bash
uv sync --directory apps/baseten-livekit-agent
uv run --directory apps/baseten-livekit-agent python agent.py dev
```

## Baseten Deploy

The `config.yaml` is the actual Truss deployment config. It uses a normal Truss model server, so local Docker is not required.

The Truss `Model.load()` starts `agent.py start` as a background LiveKit worker. `predict()` acts as a health/status check.

Deploy:

```bash
truss push apps/baseten-livekit-agent --wait --promote --deployment-name sanne-livekit-agent
```

Before deploying, create these Baseten secrets:

```text
baseten_api_key
livekit_url
livekit_api_key
livekit_api_secret
mistral_api_key
```

## Next Baseten Work

To make the full STT -> VAD -> LLM -> TTS stack Baseten-native, create or identify:

1. Baseten streaming transcription model ID.
2. Baseten OmniVoice model/deployment ID.
3. Desired Baseten Model API LLM model name.

Then replace the `build_stt()` and `build_tts()` fallbacks with WebSocket/custom service adapters.
