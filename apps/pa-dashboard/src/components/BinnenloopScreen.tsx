import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import "./binnenloop.css";

type Screen = "optimist" | "scepticus";

const PERSONA: Record<Screen, { label: string; role: string; accent: string }> =
  {
    optimist: {
      label: "De Optimist",
      role: "AI maakt ons slimmer.",
      accent: "var(--sanne-yellow)",
    },
    scepticus: {
      label: "De Scepticus",
      role: "Of toch niet?",
      accent: "var(--sanne-purple)",
    },
  };

interface TranscriptLine {
  speaker: Screen;
  text: string;
  ts: number;
}

interface DuoTokenResponse {
  participant_token: string;
  server_url: string;
  room: string;
  screen: string;
}

export default function BinnenloopScreen({ screen }: { screen: Screen }) {
  const persona = PERSONA[screen];
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "waiting"
  >("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const retryRef = useRef<number | null>(null);

  const ownIdentity = useMemo(() => `agent-${screen}`, [screen]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const res = await fetch(
        `/duo-token?screen=${screen}&room=binnenloop`
      );
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
          const audioEl = (track as RemoteAudioTrack).attach();
          audioEl.autoplay = true;
          audioEl.style.display = "none";
          if (audioRef.current?.parentElement) {
            audioRef.current.parentElement.appendChild(audioEl);
          } else {
            document.body.appendChild(audioEl);
          }
          (track as RemoteAudioTrack).on("muted", () => setIsSpeaking(false));
          (track as RemoteAudioTrack).on("unmuted", () => setIsSpeaking(true));
        }
      });

      room.on(
        RoomEvent.ActiveSpeakersChanged,
        (speakers: RemoteParticipant[] | { identity?: string }[]) => {
          const speaking = speakers.some(
            (p) => "identity" in p && p.identity === ownIdentity
          );
          setIsSpeaking(speaking);
        }
      );

      room.on(
        RoomEvent.DataReceived,
        (payload, _participant, _kind, topic) => {
          if (topic && topic !== "duo") return;
          try {
            const msg = JSON.parse(new TextDecoder().decode(payload));
            if (msg?.type === "transcript" && typeof msg.text === "string") {
              setLines((prev) =>
                [
                  ...prev,
                  {
                    speaker: msg.speaker as Screen,
                    text: msg.text as string,
                    ts: Date.now(),
                  },
                ].slice(-12)
              );
            }
          } catch {
            // ignore malformed
          }
        }
      );

      room.on(RoomEvent.Disconnected, () => setStatus("idle"));

      await room.connect(tok.server_url, tok.participant_token, {
        autoSubscribe: true,
      });
      setStatus("connected");

      // Forceer subscribe op alle bestaande participants.
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
      console.warn("BinnenloopScreen connect failed, retrying:", e);
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

  const lastOwn = [...lines].reverse().find((l) => l.speaker === screen);
  const lastOther = [...lines].reverse().find((l) => l.speaker !== screen);

  return (
    <div
      className="binnenloop"
      style={{ ["--persona-accent" as string]: persona.accent }}
    >
      <div className="binnenloop-eyebrow">Binnenloop · This is not AI</div>

      <div className="binnenloop-stage">
        <div className={`binnenloop-orb ${isSpeaking ? "speaking" : ""}`}>
          <div className="binnenloop-orb-core" />
          <div className="binnenloop-orb-glow" />
        </div>

        <div className="binnenloop-meta">
          <h1>{persona.label}</h1>
          <p>{persona.role}</p>
        </div>
      </div>

      <div className="binnenloop-captions">
        {lastOwn && (
          <p className="binnenloop-caption-self">{lastOwn.text}</p>
        )}
        {lastOther && (
          <p className="binnenloop-caption-other">
            <span>{PERSONA[lastOther.speaker].label}:</span> {lastOther.text}
          </p>
        )}
      </div>

      <div className={`binnenloop-status status-${status}`}>
        {status === "connected" && "live"}
        {status === "connecting" && "verbinden…"}
        {status === "idle" && "wacht op verbinding"}
        {status === "waiting" && "wacht op verbinding"}
      </div>

      <audio ref={audioRef} hidden />
    </div>
  );
}
