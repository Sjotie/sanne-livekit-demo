import { AnimatePresence, motion } from "motion/react";
import StaggeredText from "./react-bits/staggered-text";
import type { ActionEvent } from "../types";

const ICONS: Record<ActionEvent["type"], string> = {
  move_event: "→",
  create_event: "+",
  delete_event: "×",
  update_event: "✎",
  mark_read: "✓",
  mark_unread: "•",
  archive_email: "▼",
  reply_email: "✉",
  toggle_star: "★",
  compose_email: "✉",
  forward_email: "➠",
  send_message: "↗",
};

const COLORS: Record<ActionEvent["type"], string> = {
  move_event: "#68d4ff",
  create_event: "#55d38a",
  delete_event: "#ff5b6a",
  update_event: "#facc15",
  mark_read: "#68d4ff",
  mark_unread: "#68d4ff",
  archive_email: "#a78bfa",
  reply_email: "#55d38a",
  toggle_star: "#facc15",
  compose_email: "#55d38a",
  forward_email: "#a78bfa",
  send_message: "#d6ff02",
};

export default function ActionAnnouncer({
  action,
}: {
  action: ActionEvent | undefined;
}) {
  return (
    <AnimatePresence mode="wait">
      {action && (
        <motion.div
          key={action.id}
          className="action-announcer"
          initial={{ opacity: 0, y: -60, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.9 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 26,
          }}
          style={{ ["--accent" as string]: COLORS[action.type] }}
        >
          <motion.span
            className="action-icon"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 18,
              delay: 0.15,
            }}
          >
            {ICONS[action.type]}
          </motion.span>
          <StaggeredText
            key={action.id}
            text={action.message}
            as="span"
            className="action-message"
            segmentBy="words"
            delay={45}
            duration={0.5}
            blur
            direction="bottom"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
