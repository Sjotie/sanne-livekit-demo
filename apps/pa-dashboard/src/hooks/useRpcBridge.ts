import { useEffect, useRef } from "react";
import type { Room, RpcInvocationData } from "livekit-client";
import { RpcError } from "livekit-client";
import type { PaAction, PaState } from "../types";
import { paReducer } from "../state";

export function useRpcBridge(
  room: Room | undefined,
  state: PaState,
  dispatch: React.Dispatch<PaAction>,
) {
  // Keep a ref synced with state so RPC handlers never read stale data
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    if (!room) return;

    room.registerRpcMethod("pa_query", async (data: RpcInvocationData) => {
      try {
        const query = JSON.parse(data.payload);
        const s = stateRef.current;

        switch (query.type) {
          case "calendar":
            return JSON.stringify({ events: s.events });
          case "emails": {
            const folder = query.folder ?? "inbox";
            return JSON.stringify({
              emails: s.emails.filter(
                (m) => !m.archived && m.folder === folder
              ),
            });
          }
          case "email_detail": {
            const email = s.emails.find((m) => m.id === query.id);
            if (!email) throw new RpcError(1, `Email not found: ${query.id}`);
            return JSON.stringify({ email });
          }
          case "search_emails": {
            const q = String(query.q ?? "").toLowerCase();
            if (!q) return JSON.stringify({ emails: [] });
            const hits = s.emails.filter(
              (m) =>
                !m.archived &&
                (m.subject.toLowerCase().includes(q) ||
                  m.from.toLowerCase().includes(q) ||
                  m.body.toLowerCase().includes(q) ||
                  m.to.some((t) => t.toLowerCase().includes(q)))
            );
            return JSON.stringify({ emails: hits });
          }
          case "contacts":
            return JSON.stringify({ contacts: s.contacts });
          case "missed_calls":
            return JSON.stringify({
              missed_calls: s.missedCalls.filter((call) => !call.handled),
            });
          default:
            throw new RpcError(1, `Unknown query type: ${query.type}`);
        }
      } catch (e) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(1500, "Failed to parse query payload");
      }
    });

    room.registerRpcMethod("pa_action", async (data: RpcInvocationData) => {
      try {
        const action = JSON.parse(data.payload) as PaAction;
        const s = stateRef.current;

        // Validate the target exists for id-bound mutation actions
        if (
          action.type === "move_event" ||
          action.type === "delete_event" ||
          action.type === "update_event"
        ) {
          if (!s.events.find((e) => e.id === action.id)) {
            throw new RpcError(1, `Event not found: ${action.id}`);
          }
        }
        if (
          action.type === "mark_read" ||
          action.type === "mark_unread" ||
          action.type === "archive_email" ||
          action.type === "reply_email" ||
          action.type === "toggle_star" ||
          action.type === "forward_email"
        ) {
          if (!s.emails.find((e) => e.id === action.id)) {
            throw new RpcError(1, `Email not found: ${action.id}`);
          }
        }
        // compose_email has no pre-existing target — only validate recipient
        if (action.type === "compose_email") {
          if (!action.to || action.to.length === 0) {
            throw new RpcError(1, "compose_email requires at least one recipient");
          }
        }
        if (action.type === "send_message") {
          if (!action.to || action.to.length === 0) {
            throw new RpcError(1, "send_message requires at least one recipient");
          }
          if (!action.body) {
            throw new RpcError(1, "send_message requires a body");
          }
        }

        // Apply reducer synchronously to stateRef so the response reflects
        // the post-mutation state.
        const nextState = paReducer(s, action);
        stateRef.current = nextState;
        dispatchRef.current(action);

        // For create_event, find the new event by diffing state
        if (action.type === "create_event") {
          const newEvent = nextState.events.find(
            (e) => !s.events.some((old) => old.id === e.id)
          );
          return JSON.stringify({
            ok: true,
            action: action.type,
            created: newEvent,
          });
        }

        // For compose_email or forward_email, return the new email id
        if (
          action.type === "compose_email" ||
          action.type === "forward_email" ||
          action.type === "send_message"
        ) {
          const newEmail = nextState.emails.find(
            (e) => !s.emails.some((old) => old.id === e.id)
          );
          return JSON.stringify({
            ok: true,
            action: action.type,
            created: newEmail,
          });
        }

        return JSON.stringify({ ok: true, action: action.type });
      } catch (e) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(1500, "Failed to parse action payload");
      }
    });

    // Cleanup: unregister on unmount (required for React StrictMode double-mount)
    return () => {
      room.unregisterRpcMethod("pa_query");
      room.unregisterRpcMethod("pa_action");
    };
  }, [room]);
}
