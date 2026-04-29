import { useEffect, useReducer, useRef, useState } from "react";
import { useSession, SessionProvider } from "@livekit/components-react";
import { TokenSource } from "livekit-client";
import type { Room } from "livekit-client";

import {
  INITIAL_EVENTS,
  INITIAL_EMAILS,
  INITIAL_CONTACTS,
  INITIAL_MISSED_CALLS,
} from "../mock-data";
import { paReducer } from "../state";
import { useRpcBridge } from "../hooks/useRpcBridge";
import ActionAnnouncer from "./ActionAnnouncer";
import ReplyOverlay from "./ReplyOverlay";
import SentEmailFlyer from "./SentEmailFlyer";
import type { ActionEvent } from "../types";

// Use relative URL so the frontend works behind any host.
// In dev (port 5174), Vite proxies /token to port 1421.
// In production, the combined server serves both static files and /token.
const TOKEN_SERVER = "/token";

type VoiceSessionProps = {
  agentName: string;
  label: string;
  description: string;
};

const SCENE_BY_ACTION: Partial<Record<ActionEvent["type"], number>> = {
  reply_email: 2,
  compose_email: 2,
  move_event: 3,
  update_event: 4,
  forward_email: 5,
  send_message: 6,
};

function sceneForAction(action: ActionEvent): number {
  if (action.type === "compose_email" && action.replyTo?.from.includes("Leonie")) {
    return 4;
  }
  if (action.type === "send_message") return 6;
  return SCENE_BY_ACTION[action.type] ?? 1;
}

export default function VoiceSession({
  agentName,
  label,
  description,
}: VoiceSessionProps) {
  const tokenSource = TokenSource.custom(async () => {
    const res = await fetch(TOKEN_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentName: agentName.startsWith("pa-") ? "pa" : agentName,
        room: `werkbank-${agentName}-${Date.now()}`,
        room_config: {
          agents: [{ agent_name: agentName.startsWith("pa-") ? "pa" : agentName }],
        },
      }),
    });
    const data = await res.json();
    return { participantToken: data.participant_token, serverUrl: data.server_url };
  });
  const session = useSession(tokenSource);

  useEffect(() => {
    session.start();
    return () => {
      session.end();
    };
  }, []);

  return (
    <SessionProvider session={session}>
      <WerkbankDashboard
        room={session.room}
        label={label}
        description={description}
      />
    </SessionProvider>
  );
}

function WerkbankDashboard({
  room,
  label,
  description,
}: {
  room: Room;
  label: string;
  description: string;
}) {
  const [state, dispatch] = useReducer(paReducer, {
    events: INITIAL_EVENTS,
    emails: INITIAL_EMAILS,
    contacts: INITIAL_CONTACTS,
    missedCalls: INITIAL_MISSED_CALLS,
  });
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // Auto-clear lastAction after 3.5s so the banner goes away
  const [visibleAction, setVisibleAction] = useState(state.lastAction);

  function sendScene(scene: number, caption?: string) {
    frameRef.current?.contentWindow?.postMessage(
      { type: "werkbank:set", scene, caption: caption ?? "" },
      "*"
    );
  }

  useEffect(() => {
    sendScene(0);
  }, []);

  useEffect(() => {
    if (!state.lastAction) return;
    setVisibleAction(state.lastAction);
    sendScene(sceneForAction(state.lastAction), state.lastAction.message);
    const t = setTimeout(() => {
      setVisibleAction((current) =>
        current?.id === state.lastAction?.id ? undefined : current
      );
    }, 3500);
    return () => clearTimeout(t);
  }, [state.lastAction]);

  useRpcBridge(room, state, dispatch);

  return (
    <div className="werkbank-shell">
      <iframe
        ref={frameRef}
        className="werkbank-frame"
        title="This is not AI Werkbank Demo"
        src="/werkbank/index.html"
        onLoad={() => sendScene(0)}
      />
      <div className="werkbank-livebar">
        <div>
          <div className="werkbank-livebar-label">{label}</div>
          <div className="werkbank-livebar-description">{description}</div>
        </div>
        <div className="werkbank-livebar-status">LiveKit verbonden</div>
      </div>
      <ActionAnnouncer action={visibleAction} />
      <ReplyOverlay action={state.lastAction} />
      <SentEmailFlyer action={state.lastAction} />
    </div>
  );
}
