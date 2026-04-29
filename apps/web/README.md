# Sanne Web Demo

Minimal browser layer for the Sanne voice-agent demo. It records microphone audio, streams chunks to the Baseten agent WebSocket, and displays returned session events.

Open `index.html` directly for local testing, or serve the folder with any static server.

Use the local agent endpoint while developing:

```text
ws://127.0.0.1:8787/ws
```

Use the Baseten endpoint after deployment:

```text
wss://chain-or-model-id.api.baseten.co/environments/production/websocket
```
