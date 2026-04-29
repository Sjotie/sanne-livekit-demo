import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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

describe("browser voice room flow", () => {
  test("connect prepares microphone before token and keeps chat fallback available", () => {
    const source = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");

    expect(source).toContain('setStatus("Microfoon openen")');
    expect(source.indexOf("await tryEnsureMicrophoneTrack();")).toBeLessThan(
      source.indexOf('await fetch("/token"'),
    );
    expect(source.indexOf("await room.connect(serverUrl, token);")).toBeLessThan(
      source.indexOf("if (micTrack) await publishMicrophone();"),
    );
    expect(source).toContain("Microfoon niet beschikbaar. Chat-test blijft werken.");
    expect(source).toContain("mic aan");
  });
});

describe("LiveKit text testing", () => {
  test("sends typed test messages over the standard lk.chat topic", () => {
    const html = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
    const source = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");

    expect(html).toContain("Chat test");
    expect(html).toContain("chatInput");
    expect(source).toContain('sendText(text, { topic: "lk.chat" })');
    expect(source).toContain('registerTextStreamHandler("lk.transcription"');
  });
});

describe("Werkbank test legend", () => {
  test("shows passive voice prompts instead of scripted action buttons", () => {
    const html = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

    expect(html).toContain("Legenda testvragen");
    expect(html).toContain("Shortcut, help me even scherp krijgen wat ik nu wel en niet moet doen.");
    expect(html).toContain("Good: context, advies, concepten.");
    expect(html).not.toContain("data-action");
  });
});

describe("Werkbank draft visuals", () => {
  test("renders draft cards separately from sent mail cards", () => {
    const app = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
    const stage = readFileSync(
      new URL("./public/werkbank/werkbank-stage.jsx", import.meta.url),
      "utf8",
    );

    expect(app).toContain('mail.folder === "sent" || mail.folder === "draft"');
    expect(app).toContain('case "draft_reply_email"');
    expect(app).toContain('case "draft_message"');
    expect(stage).toContain("{mail.status ? `${mail.status} · ` : \"\"}{mail.time}");
  });
});

describe("Werkbank agenda visuals", () => {
  test("keeps previous event time so moved calendar items are visible", () => {
    const app = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
    const stage = readFileSync(
      new URL("./public/werkbank/werkbank-stage.jsx", import.meta.url),
      "utf8",
    );

    expect(app).toContain("previousStart: event.startTime");
    expect(app).toContain("previousStart: event.previousStart");
    expect(stage).toContain("CALENDAR_KIND");
    expect(stage).toContain("e.previousStart ? `${e.previousStart} → ${e.start}`");
    expect(stage).toContain("const width = Math.max(1, ((end - start) / daySpan) * 100)");
    expect(stage).not.toContain("minWidth: 128");
  });
});
