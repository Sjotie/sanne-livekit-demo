import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import StaggeredText from "./react-bits/staggered-text";
import BlurHighlight from "./react-bits/blur-highlight";
import type { ActionEvent } from "../types";

interface Props {
  action: ActionEvent | undefined;
}

type Phase = "writing" | "folding" | "flying" | "done";

export default function ReplyOverlay({ action }: Props) {
  const [phase, setPhase] = useState<Phase>("done");
  const [activeId, setActiveId] = useState<string | null>(null);
  // Use a ref for activeId in the effect so setting it doesn't retrigger
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!action || action.type !== "reply_email" || !action.replyBody) return;
    if (action.id === activeIdRef.current) return;

    activeIdRef.current = action.id;
    setActiveId(action.id);
    setPhase("writing");

    // Estimate total writing time from body length
    const wordCount = action.replyBody.split(/\s+/).length;
    const writingDurationMs = Math.min(
      Math.max(1800, wordCount * 150 + 800),
      5000
    );

    const t1 = setTimeout(() => setPhase("folding"), writingDurationMs);
    const t2 = setTimeout(() => setPhase("flying"), writingDurationMs + 800);
    const t3 = setTimeout(() => setPhase("done"), writingDurationMs + 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [action]);

  const visible =
    action?.type === "reply_email" &&
    action.id === activeId &&
    phase !== "done";

  return (
    <AnimatePresence>
      {visible && action && (
        <motion.div
          key={action.id}
          className="reply-overlay-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="reply-backdrop" />

          <motion.div
            className="reply-card"
            initial={{ scale: 0.5, opacity: 0, rotateX: -40, y: -40 }}
            animate={
              phase === "writing"
                ? { scale: 1, opacity: 1, rotateX: 0, y: 0 }
                : phase === "folding"
                ? {
                    scale: 0.75,
                    rotateX: 70,
                    y: 40,
                    opacity: 1,
                  }
                : {
                    // flying — compact envelope shooting toward inbox (top-right)
                    scale: 0.15,
                    opacity: 0,
                    x: 480,
                    y: -180,
                    rotate: 25,
                  }
            }
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 24,
            }}
          >
            <motion.div className="reply-card-head">
              <motion.span
                className="reply-card-icon"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 20,
                  delay: 0.2,
                }}
              >
                ✉
              </motion.span>
              <div className="reply-card-meta">
                <div className="reply-card-label">ANTWOORD WORDT GESCHREVEN</div>
                {action.replyTo && (
                  <div className="reply-card-to">
                    <BlurHighlight
                      highlightedBits={[action.replyTo.from]}
                      highlightColor="rgba(85, 211, 138, 0.35)"
                      blurDuration={0.6}
                      highlightDelay={0.4}
                      highlightDuration={0.6}
                    >
                      Aan: {action.replyTo.from}
                    </BlurHighlight>
                  </div>
                )}
                <div className="reply-card-subject">
                  {action.replyTo?.subject ?? ""}
                </div>
              </div>
            </motion.div>

            <div className="reply-card-body">
              {phase === "writing" && action.replyBody && (
                <StaggeredText
                  key={action.id}
                  text={action.replyBody}
                  as="p"
                  segmentBy="words"
                  delay={55}
                  duration={0.45}
                  blur
                  direction="bottom"
                />
              )}
            </div>

            <div className="reply-card-foot">
              {phase === "writing" && "Bezig met schrijven..."}
              {phase === "folding" && "Verzenden..."}
              {phase === "flying" && "Verzonden!"}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
