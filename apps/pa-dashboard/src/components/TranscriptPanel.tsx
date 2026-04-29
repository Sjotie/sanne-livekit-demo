import { useEffect, useMemo, useRef, useState } from "react";
import {
  ControlBar,
  RoomAudioRenderer,
  useAgent,
  useSessionMessages,
} from "@livekit/components-react";
import "@livekit/components-styles";
import AgenticBall from "./react-bits/agentic-ball";

export default function TranscriptPanel() {
  const agent = useAgent();
  const { messages, send, isSending } = useSessionMessages();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const toolStatus = agent.attributes?.["tool.status"];

  // Agentic ball reacts to agent state
  const ballProps = useMemo(() => {
    if (toolStatus === "processing") {
      return { speed: 2.5, hueRotation: 0.8, saturation: 1.8, brightness: 1.2 }; // warm green — action
    }
    if (agent.state === "thinking") {
      return { speed: 1.5, hueRotation: 3, saturation: 1.5, brightness: 1.1 }; // purple — thinking
    }
    if (agent.state === "speaking") {
      return { speed: 1.8, hueRotation: 2, saturation: 1.6, brightness: 1.15 }; // blue — speaking
    }
    if (agent.state === "listening") {
      return { speed: 0.8, hueRotation: 2, saturation: 1, brightness: 1 }; // calm blue
    }
    return { speed: 0.4, hueRotation: 2, saturation: 0.6, brightness: 0.8 }; // idle
  }, [agent.state, toolStatus]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isSending) return;
    send(text);
    setInput("");
  };

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <h2>Shortcut</h2>
        <span className={`connection-dot ${agent.state === "listening" || agent.state === "speaking" || agent.state === "thinking" ? "active" : ""}`} />
      </div>

      <div className="transcript-viz">
        <AgenticBall
          width="100%"
          height="100%"
          speed={ballProps.speed}
          complexity={5}
          swirl={2}
          zoom={1.2}
          hueRotation={ballProps.hueRotation}
          saturation={ballProps.saturation}
          brightness={ballProps.brightness}
          backgroundColor="#00000000"
        />
      </div>

      <div className="transcript-status">
        {agent.state === "thinking" && (
          <span className="status-thinking">Thinking...</span>
        )}
        {toolStatus === "processing" && (
          <span className="status-tool">Executing action...</span>
        )}
        {agent.state === "speaking" && (
          <span className="status-speaking">Speaking</span>
        )}
        {agent.state === "listening" && (
          <span className="status-listening">Listening</span>
        )}
      </div>

      <div className="transcript-messages" ref={scrollRef}>
        {messages.map((msg, i) => {
          const isAgent = msg.type === "agentTranscript";
          const isUser = msg.type === "userTranscript";
          // Extract text from different message types
          const text = "message" in msg
            ? (msg as { message: string }).message
            : "";
          if (!text) return null;
          return (
            <div key={msg.id ?? i} className={`transcript-msg ${isAgent ? "agent" : "user"}`}>
              <span className="msg-role">{isAgent ? "PA" : "You"}</span>
              <span className="msg-text">{text}</span>
            </div>
          );
        })}
      </div>

      <div className="transcript-input">
        <input
          type="text"
          placeholder="Vraag iets aan Shortcut..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={isSending}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isSending || !input.trim()}
        >
          &#9654;
        </button>
      </div>

      <div className="transcript-controls">
        <ControlBar
          controls={{ microphone: true, camera: false, screenShare: false }}
          style={{ width: "100%" }}
        />
      </div>

      <RoomAudioRenderer />
    </div>
  );
}
