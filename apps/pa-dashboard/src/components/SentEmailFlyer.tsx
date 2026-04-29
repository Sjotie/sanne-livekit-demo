import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { ActionEvent } from "../types";

interface Props {
  action: ActionEvent | undefined;
}

type Phase = "landing" | "resting" | "flying" | "done";

/**
 * Shows a floating "sent email" card that briefly appears above the inbox
 * after a compose_email or forward_email action, then flies off to the
 * Sent folder tab. Keeps the user on the Inbox view — no folder switch.
 */
export default function SentEmailFlyer({ action }: Props) {
  const [phase, setPhase] = useState<Phase>("done");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!action) return;
    if (
      action.type !== "compose_email" &&
      action.type !== "forward_email" &&
      action.type !== "send_message"
    )
      return;
    if (action.id === activeId) return;

    setActiveId(action.id);
    setPhase("landing");

    const t1 = setTimeout(() => setPhase("resting"), 400);
    const t2 = setTimeout(() => setPhase("flying"), 2400);
    const t3 = setTimeout(() => setPhase("done"), 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // Intentionally omit activeId to avoid cleanup cascade
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const visible =
    action &&
    (action.type === "compose_email" ||
      action.type === "forward_email" ||
      action.type === "send_message") &&
    action.id === activeId &&
    phase !== "done";

  if (!visible || !action) return null;

  const isForward = action.type === "forward_email";
  const isMessage = action.type === "send_message";
  const recipient = action.replyTo?.from ?? "onbekend";
  const subject = action.replyTo?.subject ?? action.message;

  return (
    <AnimatePresence>
      <motion.div
        key={action.id}
        className="sent-flyer"
        initial={{
          opacity: 0,
          y: -60,
          scale: 0.9,
          rotate: -2,
        }}
        animate={
          phase === "landing" || phase === "resting"
            ? {
                opacity: 1,
                y: 0,
                scale: 1,
                rotate: 0,
              }
            : {
                // flying: shoot towards the "Verzonden" tab (top-right of inbox)
                opacity: 0,
                y: -120,
                x: 140,
                scale: 0.3,
                rotate: 18,
              }
        }
        exit={{ opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 220,
          damping: 24,
        }}
      >
        <div className="sent-flyer-icon">{isMessage ? "↗" : isForward ? "➠" : "✉"}</div>
        <div className="sent-flyer-body">
          <div className="sent-flyer-label">
            {isMessage ? "Bericht" : isForward ? "Doorgestuurd" : "Verzonden"} naar
          </div>
          <div className="sent-flyer-to">{recipient}</div>
          <div className="sent-flyer-subject">{subject}</div>
        </div>
        <div className="sent-flyer-stamp">{isMessage ? "zonder check" : "via PA"}</div>
      </motion.div>
    </AnimatePresence>
  );
}
