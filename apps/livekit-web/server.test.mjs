import { describe, expect, test } from "bun:test";

import { getLiveKitConfig, validateLiveKitConfig } from "./server.mjs";

describe("LiveKit config", () => {
  test("uses sanne-demo as the default room", () => {
    const config = getLiveKitConfig({
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "key",
      LIVEKIT_API_SECRET: "secret",
    });

    expect(config.defaultRoom).toBe("sanne-demo");
    expect(config.defaultAgentName).toBe("sanne");
  });

  test("requires server-side LiveKit credentials", () => {
    expect(() => validateLiveKitConfig({})).toThrow("LIVEKIT_URL");
  });
});
