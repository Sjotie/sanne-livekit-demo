import { useState } from "react";
import VoiceSession from "./components/VoiceSession";
import BinnenloopScreen from "./components/BinnenloopScreen";

const DEMOS = [
  {
    id: "pa-good",
    agentName: "pa-good",
    label: "PA checkt eerst",
    description: "Zelfde werkbank, acties pas na akkoord.",
  },
  {
    id: "pa-bad",
    agentName: "pa-bad",
    label: "PA gaat te ver",
    description: "De agent handelt autonoom af zodra het handig lijkt.",
  },
  {
    id: "sanne",
    agentName: "sanne-voiceprompt",
    label: "Sanne voice",
    description: "De bestaande Sanne-stemagent op dezelfde visual basis.",
  },
];

export default function App() {
  const [activeDemoId, setActiveDemoId] = useState(DEMOS[0].id);
  const activeDemo = DEMOS.find((demo) => demo.id === activeDemoId) ?? DEMOS[0];

  // Binnenloop-modus: één persona per laptop, fullscreen, geen Werkbank.
  // URL-vorm: /?screen=optimist  of  /?screen=criticus
  // (?screen=scepticus blijft werken als alias voor backward compat.)
  const screenParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("screen")
      : null;
  const normalizedScreen =
    screenParam === "scepticus" ? "criticus" : screenParam;
  if (normalizedScreen === "optimist" || normalizedScreen === "criticus") {
    return <BinnenloopScreen screen={normalizedScreen} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-dot" />
          <span>This is not AI · Werkbank</span>
        </div>
        <div className="demo-switch" aria-label="Demo kiezen">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              className={demo.id === activeDemo.id ? "active" : ""}
              onClick={() => setActiveDemoId(demo.id)}
            >
              {demo.label}
            </button>
          ))}
        </div>
        <span className="app-date">
          {new Date().toLocaleDateString("nl-NL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </header>
      <VoiceSession
        key={activeDemo.id}
        agentName={activeDemo.agentName}
        label={activeDemo.label}
        description={activeDemo.description}
      />
    </div>
  );
}
