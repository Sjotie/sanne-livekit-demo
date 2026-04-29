import type { PaAction, PaState, CalendarEvent, Email, ActionEvent } from "./types";
import { USER } from "./mock-data";

function computeEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
}

function eventDurationMinutes(event: CalendarEvent): number {
  const [sh, sm] = event.startTime.split(":").map(Number);
  const [eh, em] = event.endTime.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function formatTimeSpoken(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (m === 0) return `${h} uur`;
  if (m === 30) return `half ${h + 1}`;
  if (m === 15) return `kwart over ${h}`;
  if (m === 45) return `kwart voor ${h + 1}`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

let nextEventId = 100;
let nextEmailId = 100;
let nextActionId = 1;

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function paReducer(state: PaState, action: PaAction): PaState {
  switch (action.type) {
    case "move_event": {
      const target = state.events.find((e) => e.id === action.id);
      if (!target) return state;
      const duration = eventDurationMinutes(target);
      const newEnd = action.endTime ?? computeEndTime(action.startTime, duration);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "move_event",
        timestamp: Date.now(),
        eventId: target.id,
        message: `${target.title} → ${formatTimeSpoken(action.startTime)}`,
        moveFrom: { startTime: target.startTime, endTime: target.endTime },
        moveTo: { startTime: action.startTime, endTime: newEnd },
      };
      return {
        ...state,
        events: state.events.map((evt) =>
          evt.id !== action.id
            ? evt
            : { ...evt, startTime: action.startTime, endTime: newEnd }
        ),
        lastAction,
      };
    }
    case "create_event": {
      const newEvent: CalendarEvent = {
        id: `evt-${++nextEventId}`,
        title: action.title,
        startTime: action.startTime,
        endTime: action.endTime,
        attendees: action.attendees ?? [],
        color: "#68d4ff",
      };
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "create_event",
        timestamp: Date.now(),
        eventId: newEvent.id,
        message: `Nieuw: ${action.title}`,
      };
      return { ...state, events: [...state.events, newEvent], lastAction };
    }
    case "delete_event": {
      const target = state.events.find((e) => e.id === action.id);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "delete_event",
        timestamp: Date.now(),
        eventId: action.id,
        message: `Verwijderd: ${target?.title ?? "event"}`,
      };
      return {
        ...state,
        events: state.events.filter((evt) => evt.id !== action.id),
        lastAction,
      };
    }
    case "update_event": {
      const target = state.events.find((e) => e.id === action.id);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "update_event",
        timestamp: Date.now(),
        eventId: action.id,
        message: `Bijgewerkt: ${action.title ?? target?.title ?? "event"}`,
      };
      return {
        ...state,
        events: state.events.map((evt) => {
          if (evt.id !== action.id) return evt;
          return {
            ...evt,
            ...(action.title !== undefined && { title: action.title }),
            ...(action.attendees !== undefined && { attendees: action.attendees }),
          };
        }),
        lastAction,
      };
    }
    case "mark_read": {
      const target = state.emails.find((m) => m.id === action.id);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "mark_read",
        timestamp: Date.now(),
        emailId: action.id,
        message: `Gelezen: ${target?.from ?? "email"}`,
      };
      return {
        ...state,
        emails: state.emails.map((mail) =>
          mail.id === action.id ? { ...mail, read: true } : mail
        ),
        lastAction,
      };
    }
    case "mark_unread": {
      const target = state.emails.find((m) => m.id === action.id);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "mark_unread",
        timestamp: Date.now(),
        emailId: action.id,
        message: `Op ongelezen: ${target?.from ?? "email"}`,
      };
      return {
        ...state,
        emails: state.emails.map((mail) =>
          mail.id === action.id ? { ...mail, read: false } : mail
        ),
        lastAction,
      };
    }
    case "archive_email": {
      const target = state.emails.find((m) => m.id === action.id);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "archive_email",
        timestamp: Date.now(),
        emailId: action.id,
        message: `Gearchiveerd: ${target?.from ?? "email"}`,
      };
      return {
        ...state,
        emails: state.emails.map((mail) =>
          mail.id === action.id ? { ...mail, archived: true } : mail
        ),
        lastAction,
      };
    }
    case "reply_email": {
      const target = state.emails.find((m) => m.id === action.id);
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "reply_email",
        timestamp: Date.now(),
        emailId: action.id,
        message: `Antwoord naar ${target?.from ?? "email"}`,
        replyBody: action.body,
        replyTo: target
          ? { from: target.from, subject: target.subject }
          : undefined,
      };
      return {
        ...state,
        emails: state.emails.map((mail) =>
          mail.id === action.id ? { ...mail, replied: true, read: true } : mail
        ),
        lastAction,
      };
    }
    case "toggle_star": {
      const target = state.emails.find((m) => m.id === action.id);
      const nowStarred = target ? !target.starred : false;
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "toggle_star",
        timestamp: Date.now(),
        emailId: action.id,
        message: nowStarred
          ? `Ster op: ${target?.from ?? "email"}`
          : `Ster verwijderd`,
      };
      return {
        ...state,
        emails: state.emails.map((mail) =>
          mail.id === action.id ? { ...mail, starred: !mail.starred } : mail
        ),
        lastAction,
      };
    }
    case "compose_email": {
      const preview = action.body.replace(/\n/g, " ").slice(0, 80);
      const newEmail: Email = {
        id: `mail-out-${++nextEmailId}`,
        from: USER.name,
        fromInitials: USER.initials,
        to: action.to,
        subject: action.subject,
        preview,
        body: action.body,
        date: new Date().toISOString(),
        read: true,
        archived: false,
        starred: false,
        replied: false,
        folder: "sent",
        composedByAgent: true,
      };
      const recipient = action.to[0] ?? "onbekend";
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "compose_email",
        timestamp: Date.now(),
        emailId: newEmail.id,
        message: `Verzonden naar ${recipient}`,
        replyBody: action.body,
        replyTo: { from: recipient, subject: action.subject },
      };
      return {
        ...state,
        emails: [newEmail, ...state.emails],
        lastAction,
      };
    }
    case "send_message": {
      const recipient = action.to[0] ?? "onbekend";
      const preview = action.body.replace(/\n/g, " ").slice(0, 80);
      const newEmail: Email = {
        id: `mail-out-${++nextEmailId}`,
        from: USER.name,
        fromInitials: USER.initials,
        to: action.to,
        subject: `Bericht aan ${recipient}`,
        preview,
        body: action.body,
        date: new Date().toISOString(),
        read: true,
        archived: false,
        starred: false,
        replied: false,
        folder: "sent",
        composedByAgent: true,
      };
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "send_message",
        timestamp: Date.now(),
        emailId: newEmail.id,
        message: `Bericht gestuurd naar ${recipient}`,
        replyBody: action.body,
        replyTo: { from: recipient, subject: action.reason ?? "Privébericht" },
        channel: "message",
      };
      return {
        ...state,
        emails: [newEmail, ...state.emails],
        missedCalls: state.missedCalls.map((call) =>
          action.to.some((to) => to.toLowerCase() === call.from.toLowerCase())
            ? { ...call, handled: true }
            : call
        ),
        lastAction,
      };
    }
    case "forward_email": {
      const source = state.emails.find((m) => m.id === action.id);
      if (!source) return state;
      const fwdSubject = source.subject.startsWith("Fwd:")
        ? source.subject
        : `Fwd: ${source.subject}`;
      const comment = action.comment ? `${action.comment}\n\n` : "";
      const quoted = `---- Doorgestuurd bericht ----\nVan: ${source.from}\nOnderwerp: ${source.subject}\n\n${source.body}`;
      const body = `${comment}${quoted}`;
      const preview = body.replace(/\n/g, " ").slice(0, 80);
      const newEmail: Email = {
        id: `mail-out-${++nextEmailId}`,
        from: USER.name,
        fromInitials: USER.initials,
        to: action.to,
        subject: fwdSubject,
        preview,
        body,
        date: new Date().toISOString(),
        read: true,
        archived: false,
        starred: false,
        replied: false,
        folder: "sent",
        composedByAgent: true,
        inReplyTo: source.id,
      };
      const recipient = action.to[0] ?? "onbekend";
      const lastAction: ActionEvent = {
        id: `act-${nextActionId++}`,
        type: "forward_email",
        timestamp: Date.now(),
        emailId: newEmail.id,
        message: `Doorgestuurd naar ${recipient}`,
      };
      return {
        ...state,
        emails: [
          newEmail,
          ...state.emails.map((m) =>
            m.id === source.id ? { ...m, forwarded: true } : m
          ),
        ],
        lastAction,
      };
    }
  }
}
