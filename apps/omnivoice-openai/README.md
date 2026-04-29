# Sanne OmniVoice OpenAI TTS

Separate Baseten deployment for OmniVoice TTS.

The internal server is `omnivoice-server`, which exposes OpenAI-compatible
`/v1/audio/speech`. Baseten maps the public `/predict` route to that endpoint.

## Request

```bash
curl -X POST "https://model-<model-id>.api.baseten.co/production/predict" \
  -H "Authorization: Api-Key $BASETEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hoi, ik ben Sanne. Dit is een test.",
    "voice": "clone:sanne",
    "response_format": "pcm",
    "stream": true,
    "language": "nl",
    "num_step": 16
  }' \
  --output sanne.pcm
```

For non-streaming tests, use `response_format: "wav"` and omit `stream`.

## Voice

The `clone:sanne` profile is baked into the image during build from an 8 second
public podcast audio sample around `24:17`, where Sanne mentions her book. Sanne
gave permission to use her voice. This avoids relying on a separate profile
creation endpoint at runtime.
