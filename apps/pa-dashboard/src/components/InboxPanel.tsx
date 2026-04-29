import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import type { Email, EmailFolder, ActionEvent } from "../types";
import SentEmailFlyer from "./SentEmailFlyer";

function formatEmailTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function EmailRow({
  email,
  isAffected,
}: {
  email: Email;
  isAffected: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -24 }}
      animate={{
        opacity: 1,
        x: 0,
        scale: isAffected ? [1, 1.03, 1] : 1,
        boxShadow: isAffected
          ? [
              "0 0 0 0 rgba(104, 212, 255, 0)",
              "0 0 32px 6px rgba(104, 212, 255, 0.55)",
              "0 0 0 0 rgba(104, 212, 255, 0)",
            ]
          : "0 0 0 0 rgba(104, 212, 255, 0)",
      }}
      exit={{
        opacity: 0,
        x: 80,
        scale: 0.9,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      }}
      transition={{
        layout: { type: "spring", stiffness: 220, damping: 26 },
        opacity: { duration: 0.25 },
        x: { duration: 0.35 },
        scale: { duration: 1.4, times: [0, 0.3, 1] },
        boxShadow: { duration: 2 },
      }}
      className={`inbox-row ${email.read ? "read" : "unread"} ${
        isAffected ? "affected" : ""
      }`}
    >
      <div
        className="inbox-avatar"
        style={{
          background: email.read
            ? "rgba(255,255,255,0.09)"
            : "rgba(104,212,255,0.15)",
        }}
      >
        {email.fromInitials}
      </div>
      <div className="inbox-content">
        <div className="inbox-top-row">
          <span className="inbox-from">
            {email.folder === "sent"
              ? `Aan: ${email.to.join(", ")}`
              : email.from}
          </span>
          <span className="inbox-time">{formatEmailTime(email.date)}</span>
        </div>
        <div className="inbox-subject">
          {email.subject}
          {email.replied && (
            <motion.span
              className="inbox-badge"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              replied
            </motion.span>
          )}
          {email.forwarded && (
            <motion.span
              className="inbox-badge"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              forwarded
            </motion.span>
          )}
          {email.composedByAgent && (
            <motion.span
              className="inbox-badge inbox-badge-pa"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              via PA
            </motion.span>
          )}
        </div>
        <div className="inbox-preview">{email.preview}</div>
      </div>
      <div className="inbox-indicators">
        <AnimatePresence>
          {!email.read && (
            <motion.span
              className="inbox-unread-dot"
              initial={{ scale: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {email.starred && (
            <motion.span
              className="inbox-star"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: "spring", stiffness: 400, damping: 16 }}
            >
              &#9733;
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

interface Props {
  emails: Email[];
  lastAction?: ActionEvent;
}

export default function InboxPanel({ emails, lastAction }: Props) {
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  // Note: we intentionally do NOT auto-switch folders on compose/forward.
  // Instead, the SentEmailFlyer overlay plays the "sent" animation on top
  // of the current view so the user keeps their inbox context.

  const hasSent = emails.some((m) => m.folder === "sent");
  const visible = emails.filter((m) => !m.archived && m.folder === folder);
  const unreadCount =
    folder === "inbox" ? visible.filter((m) => !m.read).length : 0;
  const sentCount = emails.filter((m) => !m.archived && m.folder === "sent").length;

  const isFresh =
    lastAction && Date.now() - lastAction.timestamp < 3000 ? lastAction : null;

  return (
    <div className="inbox-panel">
      <SentEmailFlyer action={lastAction} />
      <div className="inbox-header">
        <h2>{folder === "inbox" ? "Inbox" : "Verzonden"}</h2>
        {folder === "inbox" && unreadCount > 0 && (
          <motion.span
            className="inbox-count"
            key={unreadCount}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
          >
            {unreadCount}
          </motion.span>
        )}
        {hasSent && (
          <div className="inbox-tabs">
            <button
              className={`inbox-tab ${folder === "inbox" ? "active" : ""}`}
              onClick={() => setFolder("inbox")}
            >
              Inbox
            </button>
            <button
              className={`inbox-tab ${folder === "sent" ? "active" : ""}`}
              onClick={() => setFolder("sent")}
            >
              Verzonden {sentCount > 0 && <span className="tab-count">{sentCount}</span>}
            </button>
          </div>
        )}
      </div>
      <div className="inbox-list">
        <LayoutGroup>
          <AnimatePresence>
            {visible.length === 0 ? (
              <div className="inbox-empty">
                {folder === "inbox" ? "Geen emails" : "Nog niks verzonden"}
              </div>
            ) : (
              visible.map((mail) => (
                <EmailRow
                  key={mail.id}
                  email={mail}
                  isAffected={isFresh?.emailId === mail.id}
                />
              ))
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}
