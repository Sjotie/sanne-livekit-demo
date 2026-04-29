# Baseten + LiveKit Voice Agent Plan

## Decision

The Sanne agent brain runs on Baseten. The web layer is our own demo interface. LiveKit remains the media/session layer for WebRTC, room dispatch, interruption handling, and browser audio reliability.

## Target Architecture

```text
Browser demo
  -> LiveKit WebRTC room
  -> Baseten-hosted LiveKit worker
       -> Silero VAD + endpointing
       -> streaming STT
       -> LLM
       -> OmniVoice TTS
       -> audio back to LiveKit room
```

If needed:

```text
Browser or telephony
  -> LiveKit media/session layer
  -> Baseten agent WebSocket
  -> Baseten STT/LLM/OmniVoice runtime
```

## What I Need From Sjoerd

1. Baseten workspace access or a `BASETEN_API_KEY` with deploy permissions.
2. Baseten LLM model name for `BASETEN_LLM_MODEL`.
3. Baseten streaming transcription model ID for `BASETEN_STT_MODEL_ID`.
4. OmniVoice deployment choice and ID:
   - deploy `k2-fsa/OmniVoice` directly,
   - use `omnivoice-server`,
   - or package a custom optimized endpoint.
5. A stable Sanne reference voice asset/profile for OmniVoice, or approval to reuse the current Pika voice only as a temporary fallback.

## Current Implementation

- `apps/livekit-web`: browser LiveKit room + token endpoint.
- `apps/livekit-agent`: local worker for quick testing.
- `apps/baseten-livekit-agent`: Baseten-deployable worker with health endpoint and Baseten LLM adapter.

The Baseten worker is live in production:

- Model ID: `qjd0lvpq`
- Production deployment ID: `31dpkpr`
- Agent name: `sanne`
- Health endpoint: `https://model-qjd0lvpq.api.baseten.co/production/predict`

The Baseten worker already supports `SANNE_LLM_PROVIDER=baseten` through Baseten's OpenAI-compatible Model API. Current production uses `nvidia/Nemotron-120B-A12B` for the LLM and keeps Mistral STT/TTS as temporary fallbacks. Baseten STT and OmniVoice TTS still need model/deployment IDs before replacing the fallbacks.

LiveKit multilingual turn detection is implemented as an optional switch, but production currently runs with `SANNE_TURN_DETECTOR=false`. This avoids packaging the ONNX turn-detector model in the Baseten image and keeps startup stable for the demo.

## Latency Measurements

Track these per turn:

- `audio.started`
- `speech.detected`
- `transcript.final`
- `llm.first_token`
- `tts.first_audio`
- `audio.done`

The first acceptance target is perceived response start under one second after Sanne stops speaking.
