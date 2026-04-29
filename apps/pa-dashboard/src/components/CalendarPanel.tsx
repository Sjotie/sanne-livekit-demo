import { motion, AnimatePresence } from "motion/react";
import type { CalendarEvent, ActionEvent } from "../types";

const START_HOUR = 8;
const END_HOUR = 18;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

function getNowPercent(): number | null {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
  if (nowMin < 0 || nowMin > TOTAL_MINUTES) return null;
  return (nowMin / TOTAL_MINUTES) * 100;
}

interface Props {
  events: CalendarEvent[];
  lastAction?: ActionEvent;
}

export default function CalendarPanel({ events, lastAction }: Props) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const nowPercent = getNowPercent();

  // Ghost trail for move: show at OLD position temporarily
  const showGhost =
    lastAction?.type === "move_event" &&
    lastAction.moveFrom &&
    Date.now() - lastAction.timestamp < 1500;

  return (
    <div className="cal-panel">
      <div className="cal-header">
        <h2>Agenda</h2>
        <span className="cal-date">{dateStr}</span>
      </div>
      <div className="cal-timeline">
        {/* Hour lines */}
        {hours.map((hour) => {
          const top = ((hour - START_HOUR) * 60 / TOTAL_MINUTES) * 100;
          return (
            <div key={hour} className="cal-hour-line" style={{ top: `${top}%` }}>
              <span className="cal-hour-label">{`${hour}:00`}</span>
            </div>
          );
        })}

        {/* Now line */}
        {nowPercent !== null && (
          <div className="cal-now-line" style={{ top: `${nowPercent}%` }} />
        )}

        {/* Ghost trail at old position during move */}
        <AnimatePresence>
          {showGhost && lastAction?.moveFrom && (
            <motion.div
              key={`ghost-${lastAction.id}`}
              className="cal-event-ghost"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.3 }}
              style={{
                top: `${
                  ((timeToMinutes(lastAction.moveFrom.startTime) - START_HOUR * 60) /
                    TOTAL_MINUTES) *
                  100
                }%`,
                height: `${Math.max(
                  ((timeToMinutes(lastAction.moveFrom.endTime) -
                    timeToMinutes(lastAction.moveFrom.startTime)) /
                    TOTAL_MINUTES) *
                    100,
                  5
                )}%`,
              }}
            />
          )}
        </AnimatePresence>

        {/* Events */}
        <AnimatePresence>
          {events.map((evt) => {
            const startMin = timeToMinutes(evt.startTime) - START_HOUR * 60;
            const endMin = timeToMinutes(evt.endTime) - START_HOUR * 60;
            const top = (startMin / TOTAL_MINUTES) * 100;
            const height = ((endMin - startMin) / TOTAL_MINUTES) * 100;
            const isAffected =
              lastAction?.eventId === evt.id &&
              Date.now() - lastAction.timestamp < 3000;

            return (
              <motion.div
                key={evt.id}
                className={`cal-event ${isAffected ? "affected" : ""}`}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{
                  opacity: 1,
                  scale: isAffected ? [1, 1.08, 1] : 1,
                  top: `${top}%`,
                  height: `${Math.max(height, 5)}%`,
                  boxShadow: isAffected
                    ? [
                        `0 0 0 0 ${evt.color}00`,
                        `0 0 24px 6px ${evt.color}aa`,
                        `0 0 0 0 ${evt.color}00`,
                      ]
                    : `0 0 0 0 ${evt.color}00`,
                }}
                exit={{ opacity: 0, scale: 0.6, x: 40, rotate: 8 }}
                transition={{
                  top: { type: "spring", stiffness: 180, damping: 22 },
                  height: { type: "spring", stiffness: 180, damping: 22 },
                  opacity: { duration: 0.25 },
                  scale: { duration: 1.2, times: [0, 0.3, 1] },
                  boxShadow: { duration: 2 },
                }}
                style={{
                  borderLeftColor: evt.color,
                }}
              >
                <div className="cal-event-time">
                  {evt.startTime} – {evt.endTime}
                </div>
                <div className="cal-event-title">{evt.title}</div>
                {evt.attendees.length > 0 && (
                  <div className="cal-event-attendees">
                    {evt.attendees.join(", ")}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
