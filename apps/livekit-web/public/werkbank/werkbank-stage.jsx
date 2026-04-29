// Werkbank stage — Sanne's huisstijl (donkerblauw + paars + geel),
// met animaties: kaarten die invliegen, mailtjes die "vallen" en wobbelen,
// post-its die plakken. Elke scene-wissel speelt entry-animaties opnieuw af.

const { useState, useEffect, useMemo, useRef } = React;

function durationMinutes(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const CALENDAR_KIND = {
  focus: { accent: "#d6ff02", label: "Focus" },
  call: { accent: "#9a8de9", label: "Call" },
  keynote: { accent: "#ff6f91", label: "Keynote" },
  travel: { accent: "#68d8d6", label: "Reis" },
  podcast: { accent: "#ffb86b", label: "Media" },
  new: { accent: "#d6ff02", label: "Nieuw" },
  default: { accent: "#6d56f9", label: "Werk" },
};

// Track which item-ids were already on stage in the previous scene, so new
// items animate in but persistent ones don't re-flicker.
function useEnter(currentIds) {
  const prev = useRef(new Set());
  const result = useMemo(() => {
    const enteringSet = new Set();
    for (const id of currentIds) {
      if (!prev.current.has(id)) enteringSet.add(id);
    }
    return enteringSet;
  }, [currentIds.join("|")]);
  useEffect(() => {
    prev.current = new Set(currentIds);
  });
  return result;
}

function CalendarStrip({ events, highlight, focusBlock }) {
  const dayStart = 9 * 60;
  const dayEnd = 18 * 60;
  const daySpan = dayEnd - dayStart;
  const ticks = ["09:00", "11:00", "13:00", "15:00", "17:00"];
  const sortedEvents = [...events].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return (
    <div style={{
      position: "absolute",
      left: 80, right: 80, top: 130,
      height: 250,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        borderRadius: 18,
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 18px 42px rgba(13,10,43,0.32) inset",
      }} />

      {ticks.map((tick) => {
        const left = ((timeToMinutes(tick) - dayStart) / daySpan) * 100;
        return (
          <div key={tick} style={{
            position: "absolute",
            left: `${left}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(254,255,251,0.1)",
          }}>
            <div style={{
              position: "absolute",
              top: -24,
              left: -16,
              color: WB_TOKENS.inkFaint,
              fontSize: 11,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.08em",
            }}>{tick}</div>
          </div>
        );
      })}

      {sortedEvents.map((e, idx) => {
        const start = Math.max(dayStart, timeToMinutes(e.start));
        const end = Math.min(dayEnd, timeToMinutes(e.end));
        const left = ((start - dayStart) / daySpan) * 100;
        const width = Math.max(1, ((end - start) / daySpan) * 100);
        const isHi = e.id === highlight;
        const moved = e.moved;
        const kind = CALENDAR_KIND[e.kind] || CALENDAR_KIND.default;
        const row = idx % 3;
        const isShort = width < 8;
        return (
          <div key={e.id} className="wb-event" style={{
            position: "absolute",
            left: `calc(${left}% + 6px)`,
            top: 28 + row * 66,
            width: `calc(${width}% - 12px)`,
            height: 58,
            minWidth: 0,
            padding: isShort ? "9px 8px 8px" : "10px 12px 9px",
            background: isHi ? WB_TOKENS.highlight : "rgba(245, 247, 240, 0.97)",
            border: moved ? `2px solid ${WB_TOKENS.highlight}` : `1px solid ${WB_TOKENS.paperEdge}`,
            borderLeft: `6px solid ${kind.accent}`,
            borderRadius: 8,
            color: WB_TOKENS.paperInk,
            overflow: "hidden",
            transform: isHi
              ? "translateY(-18px) scale(1.05) rotate(-0.6deg)"
              : moved
                ? "translateY(-8px) rotate(-1.2deg)"
                : "rotate(0.2deg)",
            boxShadow: isHi
              ? `0 22px 50px ${WB_TOKENS.highlight}88, 0 0 0 4px ${WB_TOKENS.highlight}33`
              : moved
                ? `0 18px 42px rgba(214,255,2,0.38), 0 0 0 4px rgba(214,255,2,0.22)`
                : "0 8px 22px rgba(13,10,43,0.4), 0 1px 0 rgba(255,255,255,0.4) inset",
            transition: "transform 700ms cubic-bezier(.34,1.56,.64,1), box-shadow 600ms, background 400ms",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            animation: `wb-event-in 600ms ${idx * 50}ms cubic-bezier(.34,1.56,.64,1) backwards`,
          }}>
            {moved && (
              <div className="wb-fade-in" style={{
                position: "absolute",
                left: 8,
                right: 8,
                top: -28,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                background: WB_TOKENS.highlight,
                color: WB_TOKENS.paperInk,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                boxShadow: "0 10px 24px rgba(214,255,2,0.28)",
                whiteSpace: "nowrap",
              }}>
                {e.previousStart ? `${e.previousStart} → ${e.start}` : `Nieuw: ${e.start}`}
              </div>
            )}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isShort ? 4 : 8,
              fontSize: isShort ? 9 : 10, fontWeight: 800, letterSpacing: "0.08em",
              opacity: 0.62, textTransform: "uppercase",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.start}–{e.end}</span>
              {!isShort && <span style={{ color: kind.accent }}>{kind.label}{e.star ? " ★" : ""}</span>}
            </div>
            <div style={{
              fontSize: isShort ? 11 : 13, fontWeight: 700, lineHeight: 1.12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>{e.title}</div>
          </div>
        );
      })}
      {focusBlock && (
        <div className="wb-fade-in" style={{
          position: "absolute",
          left: 0, right: 0, bottom: -36,
          textAlign: "center",
          fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase",
          color: WB_TOKENS.highlight, fontWeight: 700,
        }}>
          Vrijgemaakt focusblok · {focusBlock.from}–{focusBlock.to} · zichtbaar in de agenda
        </div>
      )}
    </div>
  );
}

function MailPaper({ mail, x, y, isEntering }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y,
      width: 380, padding: "20px 24px",
      background: WB_TOKENS.paper, color: WB_TOKENS.paperInk,
      borderRadius: 4,
      transform: `rotate(${mail.rotate || 0}deg)`,
      boxShadow: "0 22px 44px rgba(13,10,43,0.55), 0 2px 6px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.7) inset",
      borderLeft: `4px solid ${WB_TOKENS.accent}`,
      transition: "transform 700ms cubic-bezier(.34,1.56,.64,1)",
      animation: isEntering
        ? `wb-mail-drop 800ms cubic-bezier(.22,1.2,.36,1) backwards`
        : undefined,
      ["--final-rot"]: `${mail.rotate || 0}deg`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "rgba(13,10,43,0.55)",
        }}>{mail.to}</span>
        <span style={{ fontSize: 11, color: "rgba(13,10,43,0.5)", fontVariantNumeric: "tabular-nums" }}>
          {mail.status ? `${mail.status} · ` : ""}{mail.time}
        </span>
      </div>
      <div style={{
        fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em",
        marginBottom: 8, lineHeight: 1.2,
      }}>{mail.subject}</div>
      <div style={{
        fontSize: 13, lineHeight: 1.5, color: "rgba(13,10,43,0.78)",
        whiteSpace: "pre-line",
      }}>{mail.body}</div>
    </div>
  );
}

function StickyNote({ note, x, y, isEntering }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y,
      width: 300, padding: "16px 20px",
      background: WB_TOKENS.highlight, color: WB_TOKENS.paperInk,
      borderRadius: 4,
      transform: `rotate(${note.rotate || 0}deg)`,
      boxShadow: "0 16px 34px rgba(13,10,43,0.5), 0 0 30px rgba(214,255,2,0.18)",
      animation: isEntering
        ? `wb-sticky-in 700ms cubic-bezier(.34,1.56,.64,1) backwards`
        : undefined,
      ["--final-rot"]: `${note.rotate || 0}deg`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", marginBottom: 8, opacity: 0.7,
      }}>{note.title}</div>
      {note.lines.map((l, i) => (
        <div key={i} style={{
          fontSize: 14, fontWeight: 500, lineHeight: 1.3,
          marginBottom: i < note.lines.length - 1 ? 4 : 0,
          textWrap: "pretty",
        }}>· {l}</div>
      ))}
    </div>
  );
}

function VoiceBar({ scene, sceneKey }) {
  if (!scene.say && !scene.reply && !scene.intent) return null;
  return (
    <div key={sceneKey} style={{
      position: "absolute", left: 80, right: 80, bottom: 56,
      display: "flex", gap: 28, alignItems: "stretch",
    }}>
      {scene.say && (
        <div className="wb-voice-pill" style={{
          flex: 1, padding: "20px 26px",
          background: WB_TOKENS.panel,
          backdropFilter: "blur(18px)",
          borderRadius: 22,
          border: `1px solid ${WB_TOKENS.panelBorder}`,
          boxShadow: "0 18px 36px rgba(13,10,43,0.45)",
          display: "flex", gap: 16, alignItems: "center",
          animation: "wb-voice-in 500ms cubic-bezier(.22,1.2,.36,1) backwards",
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: 5,
            background: WB_TOKENS.highlight,
            boxShadow: `0 0 0 4px ${WB_TOKENS.highlight}33, 0 0 18px ${WB_TOKENS.highlight}99`,
            animation: "wb-pulse 1.4s ease-in-out infinite",
            flexShrink: 0,
          }} />
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: WB_TOKENS.inkFaint,
              marginBottom: 4,
            }}>Sanne</div>
            <div style={{
              fontSize: 21, fontWeight: 500, color: WB_TOKENS.ink,
              letterSpacing: "-0.01em", lineHeight: 1.3,
              textWrap: "pretty",
            }}>{scene.say}</div>
          </div>
        </div>
      )}

      {scene.reply && (
        <div className="wb-voice-pill" style={{
          flex: 1, padding: "20px 26px",
          background: WB_TOKENS.accent,
          color: WB_TOKENS.ink,
          borderRadius: 22,
          boxShadow: "0 18px 36px rgba(109,86,249,0.45), 0 0 60px rgba(109,86,249,0.2)",
          display: "flex", gap: 16, alignItems: "center",
          animation: "wb-voice-in 500ms 200ms cubic-bezier(.22,1.2,.36,1) backwards",
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: 5,
            background: WB_TOKENS.highlight,
            boxShadow: `0 0 0 4px ${WB_TOKENS.highlight}44, 0 0 18px ${WB_TOKENS.highlight}99`,
            flexShrink: 0,
          }} />
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(254,255,251,0.65)",
              marginBottom: 4,
            }}>Shortcut</div>
            <div style={{
              fontSize: 17, fontWeight: 400, lineHeight: 1.4,
              fontStyle: "italic",
              textWrap: "pretty",
            }}>{scene.reply}</div>
          </div>
        </div>
      )}

      {!scene.say && !scene.reply && scene.intent && (
        <div style={{
          flex: 1, padding: "26px 32px", textAlign: "center",
          fontSize: 22, fontWeight: 500, color: WB_TOKENS.inkSoft,
          letterSpacing: "-0.01em",
          animation: "wb-voice-in 600ms cubic-bezier(.22,1.2,.36,1) backwards",
        }}>{scene.intent}</div>
      )}
    </div>
  );
}

// Fixed positions for mails on the table — by id, so they don't jump.
const MAIL_SLOTS = {
  "m-spectrum": { x: 1380, y: 470 },
  "m-leonie":   { x: 1430, y: 690 },
  "m-marieke":  { x: 1010, y: 540 },
  "m-mam":      { x: 1050, y: 760 },
  "m-pap":      { x: 1430, y: 470 },
};

const NOTE_SLOTS = {
  "n-spreker": { x: 100, y: 470 },
  "n-meta":    { x: 100, y: 660 },
};

const FALLBACK_MAIL_SLOTS = [
  { x: 1380, y: 470 },
  { x: 1430, y: 690 },
  { x: 1010, y: 540 },
  { x: 1050, y: 760 },
  { x: 1160, y: 420 },
];

const FALLBACK_NOTE_SLOTS = [
  { x: 100, y: 470 },
  { x: 100, y: 660 },
  { x: 430, y: 715 },
];

function slotFor(id, fixedSlots, fallbackSlots, index) {
  if (fixedSlots[id]) return fixedSlots[id];
  const prefix = Object.keys(fixedSlots).find((key) => id.startsWith(`${key}-`));
  return prefix ? fixedSlots[prefix] : fallbackSlots[index % fallbackSlots.length];
}

function displaySceneTime(scene) {
  if (scene.time) return scene.time;
  const raw = scene.id === "intro" ? 1 : parseInt(String(scene.id).split("-")[1] || "1");
  return `14:0${Math.min(8, Math.max(1, raw + 1))}`;
}

function WerkbankStage({ scene, width = 1920, height = 1080 }) {
  const itemIds = [
    ...scene.mails.map((m) => "mail:" + m.id),
    ...scene.notes.map((n) => "note:" + n.id),
  ];
  const entering = useEnter(itemIds);

  return (
    <div style={{
      width, height, position: "relative", overflow: "hidden",
      background: WB_TOKENS.table,
      color: WB_TOKENS.ink,
      fontFamily: '"Avenir LT Std", "Helvetica Neue", system-ui, sans-serif',
    }}>
      {/* subtle texture / depth */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `radial-gradient(circle at 60% 20%, rgba(154,141,233,0.08), transparent 50%), radial-gradient(circle at 80% 90%, rgba(214,255,2,0.04), transparent 40%)`,
        pointerEvents: "none",
      }} />

      {/* Date strap */}
      <div style={{
        position: "absolute", top: 48, left: 80, right: 80,
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <div style={{
          fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase",
          color: WB_TOKENS.inkSoft, fontWeight: 700,
        }}>Sanne · woensdag 6 mei</div>
        <div style={{
          fontSize: 14, color: WB_TOKENS.inkFaint,
          fontWeight: 500, fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.06em",
        }}>{displaySceneTime(scene)}</div>
      </div>

      <CalendarStrip
        events={scene.events}
        highlight={scene.highlight}
        focusBlock={scene.focusBlock}
      />

      {scene.mails.map((m, idx) => {
        const pos = slotFor(m.id, MAIL_SLOTS, FALLBACK_MAIL_SLOTS, idx);
        return (
          <MailPaper
            key={m.id}
            mail={m}
            x={pos.x}
            y={pos.y}
            isEntering={entering.has("mail:" + m.id)}
          />
        );
      })}

      {scene.notes.map((n, idx) => {
        const pos = slotFor(n.id, NOTE_SLOTS, FALLBACK_NOTE_SLOTS, idx);
        return (
          <StickyNote
            key={n.id}
            note={n}
            x={pos.x}
            y={pos.y}
            isEntering={entering.has("note:" + n.id)}
          />
        );
      })}

      <VoiceBar scene={scene} sceneKey={scene.id} />

      <style>{`
        @keyframes wb-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.4); }
        }
        @keyframes wb-event-in {
          from { opacity: 0; transform: translateY(-30px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wb-mail-drop {
          0%   { opacity: 0; transform: translateY(-180px) rotate(calc(var(--final-rot) - 14deg)) scale(0.9); }
          60%  { opacity: 1; transform: translateY(8px) rotate(calc(var(--final-rot) + 3deg)) scale(1.02); }
          80%  { transform: translateY(-2px) rotate(calc(var(--final-rot) - 1deg)) scale(1); }
          100% { opacity: 1; transform: translateY(0) rotate(var(--final-rot)) scale(1); }
        }
        @keyframes wb-sticky-in {
          0%   { opacity: 0; transform: translateX(-60px) rotate(calc(var(--final-rot) - 8deg)) scale(0.92); }
          60%  { opacity: 1; transform: translateX(4px) rotate(calc(var(--final-rot) + 2deg)) scale(1.03); }
          100% { opacity: 1; transform: translateX(0) rotate(var(--final-rot)) scale(1); }
        }
        @keyframes wb-voice-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wb-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .wb-fade-in { animation: wb-fade-in 600ms 200ms backwards; }
      `}</style>
    </div>
  );
}

window.WerkbankStage = WerkbankStage;
