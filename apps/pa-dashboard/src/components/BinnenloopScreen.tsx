import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import "./binnenloop.css";

type Screen = "optimist" | "criticus";

const PALETTE: Record<
  Screen,
  { label: string; sub: string; color: string; glow: string; soft: string; bgGradient: string }
> = {
  optimist: {
    label: "Optimist",
    sub: "warme stem",
    color: "#ffe082",
    glow: "rgba(255, 224, 130, 0.5)",
    soft: "rgba(255, 224, 130, 0.18)",
    bgGradient:
      "radial-gradient(110% 100% at 50% 35%, rgba(255,224,130,0.12) 0%, transparent 55%), #0a0820",
  },
  criticus: {
    label: "Criticus",
    sub: "koele stem",
    color: "#b6a7ff",
    glow: "rgba(182, 167, 255, 0.55)",
    soft: "rgba(109, 86, 249, 0.22)",
    bgGradient:
      "radial-gradient(110% 100% at 50% 35%, rgba(154,141,233,0.18) 0%, transparent 55%), #0a0820",
  },
};

interface DuoTokenResponse {
  participant_token: string;
  server_url: string;
  room: string;
  screen: string;
}

interface MimicProps {
  level: number; // 0..1 — actuele audio-amplitude
  color: string;
  glow: string;
  t: number;
}

// ─── Mimic: ringen reageren op echte audio-amplitude + subtiele heartbeat ───
function Mimic({ level, color, glow, t }: MimicProps) {
  // Idle "heartbeat": twee maten per cyclus, kleine puls.
  const heartbeat =
    0.5 * Math.pow(Math.max(0, Math.sin(t * 1.6)), 6) +
    0.25 * Math.pow(Math.max(0, Math.sin(t * 1.6 + 0.6)), 8);
  // Articulatie-kruidje voor wanneer er audio is — voorkomt vlakke ringen.
  const flutter = (Math.sin(t * 13.7 + 0.4) + 1) / 2;

  let amp: number;
  if (level > 0.04) {
    // Audio aanwezig → ringen reageren grotendeels op het echte volume,
    // met een lichte microtremoring zodat het niet plastisch oogt.
    amp = Math.min(1, 0.28 + level * 0.85 + flutter * 0.06);
  } else {
    // Stilte → subtiele heartbeat ipv vlakke statische ringen.
    amp = 0.16 + heartbeat * 0.12;
  }

  const baseR = 70;
  const rings = [
    { r: baseR + amp * 24, border: 2.5, opacity: 0.95 },
    { r: baseR + amp * 60, border: 2, opacity: 0.6 },
    { r: baseR + amp * 110, border: 1.5, opacity: 0.38 },
    { r: baseR + amp * 175, border: 1.2, opacity: 0.22 },
    { r: baseR + amp * 250, border: 1, opacity: 0.12 },
  ];

  return (
    <div className="mimic-wrap">
      {rings.map((ring, i) => (
        <div
          key={i}
          className="ring"
          style={{
            width: ring.r * 2,
            height: ring.r * 2,
            border: `${ring.border}px solid ${color}`,
            background: "transparent",
            opacity: ring.opacity,
            boxShadow: i === 0 ? `0 0 ${30 + amp * 60}px ${glow}` : "none",
            transition:
              "width 60ms linear, height 60ms linear, box-shadow 60ms linear",
          }}
        />
      ))}
    </div>
  );
}

export default function BinnenloopScreen({ screen }: { screen: Screen }) {
  const persona = PALETTE[screen];
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "waiting"
  >("idle");
  const [currentLine, setCurrentLine] = useState<string>("");
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [t, setTime] = useState(0);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const retryRef = useRef<number | null>(null);

  // WebAudio analyser leest actual audio bytes (werkt onafhankelijk van
  // LiveKit's dominant-speaker detection — Aoede valt vaak onder de SFU
  // threshold waardoor LiveKit audioLevel 0 blijft).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [level, setLevel] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const ownIdentity = useMemo(() => `agent-${screen}`, [screen]);

  // RAF: tick + AnalyserNode RMS polling, met perceptuele tuning.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const buf = new Uint8Array(1024);
    let smooth = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((p) => p + dt);

      let target = 0;
      const a = analyserRef.current;
      if (a) {
        a.getByteTimeDomainData(buf);
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buf.length); // typisch 0..0.3 voor TTS
        // Perceptuele compressie met sqrt zodat zachte stukjes ook
        // beweging geven; voorkomt lineaire saturatie.
        target = Math.min(1, Math.sqrt(rms * 4));
      }
      // Asymmetrische smoothing: snel omhoog, trager omlaag (natural decay).
      const alpha = target > smooth ? 0.45 : 0.12;
      smooth = smooth + (target - smooth) * alpha;
      setLevel(smooth);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const attachAnalyser = useCallback((track: RemoteAudioTrack) => {
    try {
      const stream = new MediaStream([track.mediaStreamTrack]);
      const ctx =
        audioCtxRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      audioCtxRef.current = ctx;
      ctx.resume().catch(() => {});

      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          /* ignore */
        }
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
    } catch (e) {
      console.warn("AnalyserNode setup faalde:", e);
    }
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const res = await fetch(`/duo-token?screen=${screen}&room=binnenloop`);
      if (!res.ok) throw new Error(`token http ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error("token endpoint not available");
      }
      const tok: DuoTokenResponse = await res.json();

      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (
          participant.identity === ownIdentity &&
          track.kind === Track.Kind.Audio
        ) {
          const audio = track as RemoteAudioTrack;
          const audioEl = audio.attach() as HTMLAudioElement;
          audioEl.autoplay = true;
          audioEl.muted = false;
          audioEl.playsInline = true;
          audioEl.style.display = "none";
          (audioContainerRef.current ?? document.body).appendChild(audioEl);
          // Probeer expliciet te starten — autoplay kan stilletjes geblokt
          // zijn na een refresh zonder user gesture.
          audioEl.play().catch((err) => {
            console.warn("autoplay geblokkeerd, wacht op tap:", err);
            setAudioBlocked(true);
          });
        }
      });

      room.on(
        RoomEvent.DataReceived,
        (payload, _participant, _kind, topic) => {
          if (topic && topic !== "duo") return;
          try {
            const msg = JSON.parse(new TextDecoder().decode(payload));
            if (msg?.type !== "transcript" || typeof msg.text !== "string") return;
            if (msg.speaker === screen) {
              setCurrentLine(msg.text);
              setTranscriptVisible(true);
            } else {
              // Ander spreekt nu → onze regel netjes uitfaden.
              setTranscriptVisible(false);
            }
          } catch {
            /* ignore */
          }
        }
      );

      room.on(RoomEvent.Disconnected, () => setStatus("idle"));

      await room.connect(tok.server_url, tok.participant_token, {
        autoSubscribe: true,
      });
      setStatus("connected");

      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (
            !pub.isSubscribed &&
            (pub as RemoteTrackPublication).setSubscribed
          ) {
            (pub as RemoteTrackPublication).setSubscribed(true);
          }
        });
      });
    } catch (e) {
      console.warn("BinnenloopScreen connect retry:", e);
      setStatus("waiting");
      retryRef.current = window.setTimeout(() => connect(), 4000);
    }
  }, [screen, ownIdentity]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) window.clearTimeout(retryRef.current);
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [connect]);

  // Click/tap-to-unlock voor autoplay (één user gesture is genoeg).
  const handleUnlock = useCallback(() => {
    const els = audioContainerRef.current?.querySelectorAll("audio");
    let unlocked = true;
    els?.forEach((el) => {
      try {
        const p = (el as HTMLAudioElement).play();
        if (p && typeof p.then === "function") {
          p.catch(() => {
            unlocked = false;
          });
        }
      } catch {
        unlocked = false;
      }
    });
    if (unlocked) setAudioBlocked(false);
  }, []);

  const isSpeaking = level > 0.04;

  return (
    <div
      className={`binnenloop binnenloop-${screen}`}
      style={{ background: persona.bgGradient }}
      onClick={handleUnlock}
    >
      <div className="binnenloop-label">
        {persona.sub}
        <span className={`binnenloop-name ${screen}`}>{persona.label}</span>
      </div>

      <Mimic level={level} color={persona.color} glow={persona.glow} t={t} />

      <div
        className={`binnenloop-transcript ${
          transcriptVisible && currentLine ? "show" : ""
        }`}
      >
        <span className="quote">"{currentLine || ""}"</span>
      </div>

      <div className="binnenloop-speaking-tag">
        {isSpeaking ? "aan het woord" : "luistert"}
      </div>

      <div className={`binnenloop-status status-${status}`}>
        {status === "connected" && "live"}
        {status === "connecting" && "verbinden…"}
        {status === "idle" && "wacht op verbinding"}
        {status === "waiting" && "wacht op verbinding"}
      </div>

      {audioBlocked && (
        <button
          type="button"
          className="binnenloop-unlock"
          onClick={handleUnlock}
        >
          tik voor geluid
        </button>
      )}

      <div ref={audioContainerRef} hidden />
    </div>
  );
}
