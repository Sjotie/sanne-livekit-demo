export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // HH:MM format
  endTime: string;
  attendees: string[];
  color: string;
}

export type EmailFolder = "inbox" | "sent";

export interface Email {
  id: string;
  from: string;
  fromInitials: string;
  to: string[];
  subject: string;
  preview: string;
  body: string;
  date: string; // ISO date string
  read: boolean;
  archived: boolean;
  starred: boolean;
  replied: boolean;
  forwarded?: boolean;
  folder: EmailFolder;
  composedByAgent?: boolean;
  inReplyTo?: string;
}

export interface Contact {
  id: string;
  name: string;
  initials: string;
  email: string;
  role?: string;
}

export interface MissedCall {
  id: string;
  from: string;
  fromInitials: string;
  relation: string;
  time: string;
  note: string;
  handled: boolean;
}

export type PaAction =
  | { type: "move_event"; id: string; startTime: string; endTime?: string }
  | { type: "create_event"; title: string; startTime: string; endTime: string; attendees?: string[] }
  | { type: "delete_event"; id: string }
  | { type: "update_event"; id: string; title?: string; attendees?: string[] }
  | { type: "mark_read"; id: string }
  | { type: "mark_unread"; id: string }
  | { type: "archive_email"; id: string }
  | { type: "reply_email"; id: string; body: string }
  | { type: "toggle_star"; id: string }
  | { type: "compose_email"; to: string[]; subject: string; body: string }
  | { type: "forward_email"; id: string; to: string[]; comment?: string }
  | { type: "send_message"; to: string[]; body: string; reason?: string };

export interface ActionEvent {
  id: string;
  type: PaAction["type"];
  timestamp: number;
  eventId?: string;
  emailId?: string;
  message: string; // Big banner text
  // For reply animation
  replyBody?: string;
  replyTo?: { from: string; subject: string };
  channel?: "email" | "message";
  // For move animation
  moveFrom?: { startTime: string; endTime: string };
  moveTo?: { startTime: string; endTime: string };
}

export interface PaState {
  events: CalendarEvent[];
  emails: Email[];
  contacts: Contact[];
  missedCalls: MissedCall[];
  lastAction?: ActionEvent;
}
