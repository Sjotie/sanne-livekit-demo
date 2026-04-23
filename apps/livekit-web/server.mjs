import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3007);
const publicDir = new URL("./public/", import.meta.url);
const appDir = dirname(fileURLToPath(import.meta.url));

loadEnvFile(resolve(appDir, "../../.env"));
loadEnvFile(resolve(appDir, ".env.local"));

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function getLiveKitConfig(env = process.env) {
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    defaultRoom: env.LIVEKIT_DEFAULT_ROOM || "sanne-demo",
    defaultAgentName: env.LIVEKIT_AGENT_NAME || "sanne",
  };
}

export function validateLiveKitConfig(config) {
  const missing = Object.entries({
    LIVEKIT_URL: config.url,
    LIVEKIT_API_KEY: config.apiKey,
    LIVEKIT_API_SECRET: config.apiSecret,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }
}

export async function createParticipantToken(
  { room, identity, name, agentName },
  config = getLiveKitConfig(),
) {
  validateLiveKitConfig(config);

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    ttl: "30m",
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  if (agentName) {
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName })],
    });
  }

  return token.toJwt();
}

export function createFetchHandler() {
  return async function fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/token" || url.pathname === "/api/livekit-token") {
      try {
        const config = getLiveKitConfig();
        let body = {};
        if (request.method === "POST") {
          try {
            body = await request.json();
          } catch {
            body = {};
          }
        }

        const room =
          body.room ||
          url.searchParams.get("room") ||
          `${config.defaultRoom}-${Date.now()}`;
        const identity =
          body.identity ||
          url.searchParams.get("identity") ||
          `guest-${crypto.randomUUID()}`;
        const name = body.name || url.searchParams.get("name") || "Sanne Demo Guest";
        const agentName =
          body.agentName ||
          body.room_config?.agents?.[0]?.agent_name ||
          url.searchParams.get("agentName") ||
          config.defaultAgentName;

        const token = await createParticipantToken({ room, identity, name, agentName }, config);

        return Response.json({
          serverUrl: config.url,
          server_url: config.url,
          room,
          identity,
          token,
          participant_token: token,
          agentName,
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to create token" },
          { status: 500 },
        );
      }
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = Bun.file(new URL(`.${pathname}`, publicDir));
    if (await asset.exists()) return new Response(asset);

    return new Response("Not found", { status: 404 });
  };
}

if (import.meta.main) {
  Bun.serve({
    port,
    fetch: createFetchHandler(),
  });

  console.log(`Sanne LiveKit web layer listening on http://127.0.0.1:${port}`);
}
