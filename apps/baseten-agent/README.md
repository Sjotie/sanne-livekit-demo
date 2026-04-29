# Sanne Baseten Agent

WebSocket voice-agent runtime intended to run on Baseten. The current implementation is a safe scaffold: it defines the session protocol, keeps conversation state server-side, and returns mock agent events until the real STT, LLM, and OmniVoice adapters are wired in.

## Local Run

```bash
uv venv
uv pip install -r apps/baseten-agent/requirements.txt
uv run python apps/baseten-agent/server.py
```

The local WebSocket endpoint is:

```text
ws://127.0.0.1:8787/ws
```

## Protocol

Client sends JSON messages:

```json
{ "type": "session.start", "sessionId": "demo-1", "voiceId": "voice_Sanne_20260413101430" }
{ "type": "audio.chunk", "mimeType": "audio/webm", "data": "base64..." }
{ "type": "audio.stop" }
{ "type": "session.end" }
```

Server sends JSON messages:

```json
{ "type": "session.ready" }
{ "type": "transcript.partial", "text": "..." }
{ "type": "transcript.final", "text": "..." }
{ "type": "agent.thinking" }
{ "type": "agent.text", "text": "..." }
{ "type": "audio.chunk", "mimeType": "audio/wav", "data": "base64..." }
{ "type": "audio.done" }
{ "type": "error", "message": "..." }
```

## Baseten Shape

For the first hosted version, deploy this as a custom WebSocket server on Baseten. The model/chain entrypoint should stay stateful for the lifetime of a WebSocket connection.

See `baseten-config.template.yaml` for the deployment shape. The final config depends on whether we deploy this as a custom Docker server or convert it to a Baseten Chain after the provider adapters are in place.

## Next Adapters

- STT: Baseten streaming transcription or another low-latency STT provider.
- LLM: Baseten Model API or dedicated deployment.
- TTS: OmniVoice deployment with voice profile caching.
- Interruptions: cancel active TTS generation when new user speech starts.
