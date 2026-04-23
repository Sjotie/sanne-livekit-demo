# Sanne LiveKit Web Layer

Minimal LiveKit setup for the Sanne demo. This app does three things:

1. Generates LiveKit participant tokens server-side with agent dispatch.
2. Connects a browser participant to a LiveKit room.
3. Publishes microphone audio to the room.

The Baseten agent remains the runtime/brain. This LiveKit layer is only the realtime media/session surface.

## Required Env

Set these in the repo-root `.env`:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_DEFAULT_ROOM=sanne-demo
LIVEKIT_AGENT_NAME=sanne
```

## Run

```bash
bun install
bun run --cwd apps/livekit-web dev
```

Then open:

```text
http://127.0.0.1:3007
```

## Notes

The token server follows the working PA demo pattern from `audio-recorder/pa-dashboard`: `TokenSource`/room participants get a LiveKit token from `/token`, and that token includes `RoomConfiguration.agents` dispatch for the requested agent name. Do not move token generation into the browser because it would expose `LIVEKIT_API_SECRET`.
