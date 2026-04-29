/**
 * Combined token + static file server for the PA Dashboard.
 *
 * Serves the built Vite frontend from ./dist and exposes a POST /token
 * endpoint that generates LiveKit access tokens with agent dispatch.
 *
 * Environment variables:
 *   PORT               — port to listen on (Railway provides this)
 *   LIVEKIT_URL        — wss:// URL of the LiveKit server
 *   LIVEKIT_API_KEY    — API key for token signing
 *   LIVEKIT_API_SECRET — API secret for token signing
 */

import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { file } from "bun";
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 1421);
const LIVEKIT_URL = process.env.LIVEKIT_URL!;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error(
    "Missing required env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET"
  );
  process.exit(1);
}

const DIST_DIR = join(import.meta.dir, "dist");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function generateToken(agentName: string): Promise<string> {
  const roomName = `room-${Date.now()}`;
  const identity = `user-${Date.now()}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: 60 * 60, // 1h
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName })],
  });
  return await at.toJwt();
}

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs"))
    return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

async function serveStatic(pathname: string): Promise<Response> {
  // SPA fallback: anything that's not an asset → index.html
  let filePath = join(DIST_DIR, pathname === "/" ? "index.html" : pathname);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(DIST_DIR, "index.html");
  }
  const f = file(filePath);
  return new Response(f, {
    headers: {
      "Content-Type": contentType(filePath),
      "Cache-Control": filePath.endsWith(".html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    },
  });
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    if (url.pathname === "/token") {
      let agentName = "pa";
      if (req.method === "POST") {
        try {
          const body = await req.json();
          if (body.room_config?.agents?.[0]?.agent_name) {
            agentName = body.room_config.agents[0].agent_name;
          }
          if (body.agentName) {
            agentName = body.agentName;
          }
        } catch {}
      }

      try {
        const accessToken = await generateToken(agentName);
        console.log(`Token issued for agent=${agentName}`);
        return new Response(
          JSON.stringify({
            participant_token: accessToken,
            server_url: LIVEKIT_URL,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      } catch (e) {
        console.error("Token generation failed:", e);
        return new Response(
          JSON.stringify({ error: "token generation failed" }),
          { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );
      }
    }

    // Fall through to static files
    if (req.method === "GET") {
      return await serveStatic(url.pathname);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
});

console.log(`PA Dashboard server listening on :${PORT}`);
console.log(`LiveKit URL: ${LIVEKIT_URL}`);
console.log(`Serving static from: ${DIST_DIR}`);
