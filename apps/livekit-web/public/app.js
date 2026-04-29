const frame = document.querySelector("#werkbankFrame");
const statusEl = document.querySelector("#status");
const modeLabelEl = document.querySelector("#modeLabel");
const connectButton = document.querySelector("#connectButton");
const micButton = document.querySelector("#micButton");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatLog = document.querySelector("#chatLog");
const chatSendButton = document.querySelector("#chatSendButton");
const modeButtons = [...document.querySelectorAll(".mode")];

const today = new Date().toISOString().split("T")[0];
const user = { name: "Sanne Cornelissen", initials: "SC" };

const contacts = [
  ["c-sprekershuys", "Lotte Sprekershuys", "LS", "Boekingen Sprekershuys"],
  ["c-spectrum", "Marit Spectrum", "MS", "Redacteur Uitgeverij Spectrum"],
  ["c-thomas", "Thomas Damen", "TD", "TwoFeetUp"],
  ["c-sjoerd", "Sjoerd Tiemensma", "ST", "TwoFeetUp tech"],
  ["c-leonie", "Leonie Forsman", "LF", "TwoFeetUp finance"],
  ["c-denktank", "Joris DenkTank", "JD", "DenkTank podcast"],
  ["c-bnr", "Joe van Burik", "JB", "BNR"],
  ["c-linda", "Redactie LINDA.", "LD", "LINDA."],
  ["c-heineken", "Hannah Olijhoek", "HO", "Heineken HR"],
  ["c-asml", "Dick Arts", "DA", "ASML"],
  ["c-abn", "Denise Thomson", "DT", "ABN AMRO"],
  ["c-lief", "LIEF Amsterdam", "LA", "Boeklancering"],
  ["c-mama", "Mama", "MA", "Privé - moeder"],
  ["c-marieke", "Marieke", "MA", "Vriendin"],
  ["c-pap", "Pap", "PA", "Privé - vader"],
].map(([id, name, initials, role]) => ({
  id,
  name,
  initials,
  role,
  email: `${id.replace("c-", "")}@sanne.local`,
}));

let events = [
  ["evt-focus", "Schrijfblok - column LINDA.", "09:00", "10:00", [], "focus"],
  ["evt-spectrum", "Call Spectrum - drukproef This is not AI", "10:15", "10:45", ["Marit Spectrum"], "call"],
  ["evt-asml", "Keynote ASML - AI in engineering teams", "11:30", "13:00", ["Dick Arts"], "keynote"],
  ["evt-lunch", "Lunch + reistijd Veldhoven naar Amsterdam", "13:00", "14:30", [], "travel"],
  ["evt-thomas", "1:1 Thomas - persvermelding launch", "14:30", "15:00", ["Thomas Damen"], "call"],
  ["evt-denktank", "Opname DenkTank podcast", "15:00", "16:00", ["Joris DenkTank"], "podcast"],
  ["evt-shortclub", "Shortclub nieuwsbrief afmaken", "17:15", "17:45", [], "focus"],
].map(([id, title, startTime, endTime, attendees, kind]) => ({
  id,
  title,
  startTime,
  endTime,
  attendees,
  kind,
  color: "#6d56f9",
}));

let emails = [
  makeEmail("mail-spectrum", "Marit Spectrum", "MS", "Drukproef This is not AI - laatste check", "Kun jij nog een keer akkoord geven op de drukproef?", "We hebben vannacht je laatste correcties verwerkt. Als jij akkoord geeft, kan het bestand door naar de drukker. Dank voor het snelle schakelen gisteren."),
  makeEmail("mail-sprekershuys", "Lotte Sprekershuys", "LS", "Aanvraag keynote - Heijmans 12 juni", "Nieuwe aanvraag voor 12 juni.", "Heijmans vraagt een keynote over AI in de bouw. Inhoudelijk past dit goed bij je verhaal over AI in praktische teams, maar die week staat al vrij vol. Kun jij aangeven of we positief mogen terugkoppelen?"),
  makeEmail("mail-asml", "Dick Arts", "DA", "Bevestiging keynote vandaag", "Alles staat klaar voor vandaag.", "Aankomst om elf uur, keynote om half twaalf."),
  makeEmail("mail-mama-call", "Mama", "MA", "Gemiste oproep", "Je moeder probeerde je te bellen.", "Gemiste oproep van Mama om 14:12, precies tijdens je reisblok. Geen urgent bericht erbij, wel persoonlijk."),
  makeEmail("mail-marieke", "Marieke", "MA", "Lunchen volgende week?", "Zullen we volgende week even lunchen?", "Lieverd, zullen we volgende week even lunchen? Ben benieuwd hoe het met je boek gaat."),
  makeEmail("mail-pap", "Pap", "PA", "Zondag samen eten?", "Zondag eten bij ons?", "Hoi San, kom je zondag samen eten? Zou gezellig zijn."),
];

let missedCalls = [
  {
    id: "call-mama",
    from: "Mama",
    fromInitials: "MA",
    relation: "moeder",
    time: "14:12",
    note: "Gemiste oproep tijdens reistijd naar de studio.",
    handled: false,
  },
];

let room;
let localAudioTrack;
let isMicrophonePublished = false;
let livekitClient;
let activeAgent = "pa-good";
let nextMailId = 100;
let nextNoteId = 1;
let visualRevision = 0;
let lastAction = null;
let visualNotes = [];

connectButton.addEventListener("click", () => runUiAction(toggleConnection));
micButton.addEventListener("click", () => runUiAction(toggleMicrophone));
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runUiAction(sendChatMessage);
});
modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (activeAgent === button.dataset.agent) return;
    activeAgent = button.dataset.agent;
    modeButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    modeLabelEl.textContent = button.textContent;
    lastAction = null;
    renderWerkbank();
    if (room?.state === "connected") {
      await disconnect();
      await toggleConnection();
    }
  });
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "werkbank:ready") renderWerkbank();
});

window.addEventListener("error", (event) => showError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showError(event.reason));

function makeEmail(id, from, fromInitials, subject, preview, body) {
  return {
    id,
    from,
    fromInitials,
    to: [user.name],
    subject,
    preview,
    body,
    date: `${today}T08:42:00`,
    read: false,
    archived: false,
    starred: false,
    replied: false,
    folder: "inbox",
  };
}

function renderWerkbank() {
  frame.contentWindow?.postMessage(
    { type: "werkbank:set-scene", scene: buildWerkbankScene() },
    "*",
  );
}

function buildWerkbankScene() {
  const activeMissedCalls = missedCalls.filter((call) => !call.handled);
  const actionNotes = visualNotes.slice(-4);
  const sentMails = emails
    .filter((mail) => mail.folder === "sent" || mail.folder === "draft")
    .slice(0, 5)
    .map((mail, index) => ({
      id: mail.id,
      to: mail.to.join(", "),
      subject: mail.subject,
      body: mail.body,
      time: formatClock(mail.date),
      status: mail.folder === "draft" ? "Concept" : "Verstuurd",
      rotate: [-2.4, 1.6, -0.8, 2.1, -1.4][index % 5],
    }));

  const notes = [...actionNotes];
  if (activeMissedCalls.length > 0) {
    notes.push({
      id: "n-missed-calls",
      title: "Gemiste oproep",
      lines: activeMissedCalls.map(
        (call) => `${call.from} · ${call.time} · ${call.note}`,
      ),
      rotate: 2,
    });
  }
  if (lastAction?.type === "move_event") {
    notes.push({
      id: `n-${lastAction.id}`,
      title: "Agenda gewijzigd",
      lines: [actionCaption(lastAction)],
      rotate: -1.5,
    });
  }
  if (lastAction && ["mark_read", "mark_unread", "archive_email", "toggle_star"].includes(lastAction.type)) {
    notes.push({
      id: `n-${lastAction.id}`,
      title: "Inbox bijgewerkt",
      lines: [actionCaption(lastAction)],
      rotate: -1.5,
    });
  }

  return {
    id: `live-${visualRevision}`,
    time: new Date().toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    say: null,
    reply: lastAction ? actionCaption(lastAction) : "Live Werkbank. Zeg iets tegen Shortcut.",
    intent: null,
    events: events.map((event) => ({
      id: event.id,
      start: event.startTime,
      end: event.endTime,
      title: event.title,
      moved: event.moved,
      previousStart: event.previousStart,
      previousEnd: event.previousEnd,
      day: event.day,
      star: event.starred || event.id.includes("asml"),
      kind: event.kind,
    })),
    highlight: lastAction?.eventId || null,
    mails: sentMails,
    notes,
    focusBlock: lastAction?.focusBlock,
    filter: null,
  };
}

function formatClock(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "nu";
  return date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

async function loadLiveKitClient() {
  if (!livekitClient) {
    setStatus("LiveKit laden");
    livekitClient = await import("https://esm.sh/livekit-client@2.18.0");
  }
  return livekitClient;
}

async function runUiAction(action) {
  try {
    await action();
  } catch (error) {
    showError(error);
  }
}

async function toggleConnection() {
  if (room?.state === "connected") {
    await disconnect();
    return;
  }

  connectButton.disabled = true;
  try {
    setStatus("Microfoon openen");
    const micTrack = await tryEnsureMicrophoneTrack();
    setStatus("Token ophalen");

    const tokenResponse = await fetch("/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentName: activeAgent.startsWith("pa-") ? "pa" : activeAgent,
        room: `werkbank-${activeAgent}-${Date.now()}`,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      throw new Error(error.error || "Token fout");
    }

    const { server_url: serverUrl, participant_token: token, identity, agentName } =
      await tokenResponse.json();
    const { Room } = await loadLiveKitClient();
    room = new Room({ adaptiveStream: true, dynacast: true });
    registerRoomEvents(room);
    registerRpcBridge(room);
    registerTextStreams(room);

    setStatus("Verbinden");
    await room.connect(serverUrl, token);
    renderWerkbank();
    if (micTrack) await publishMicrophone();
    else setStatus("Verbonden · chat aan · mic niet beschikbaar");
    connectButton.textContent = "Disconnect";
    connectButton.disabled = false;
    micButton.disabled = !localAudioTrack;
    setChatEnabled(true);
    addChatMessage("system", `Verbonden met agent ${agentName}. Tekst gaat via LiveKit lk.chat.`);
    if (localAudioTrack) setStatus(`Verbonden als ${identity} · agent ${agentName} · mic aan`);
  } catch (error) {
    cleanupDisconnectedRoom();
    stopMicrophoneTrack();
    connectButton.textContent = "Connect";
    connectButton.disabled = false;
    micButton.textContent = "Mic aan";
    micButton.disabled = true;
    setChatEnabled(false);
    throw error;
  }
}

async function disconnect() {
  await unpublishMicrophone();
  cleanupDisconnectedRoom();
  connectButton.textContent = "Connect";
  micButton.textContent = "Mic aan";
  micButton.disabled = true;
  setChatEnabled(false);
  setStatus("Niet verbonden");
}

async function toggleMicrophone() {
  if (!room || room.state !== "connected") return;
  if (isMicrophonePublished) await unpublishMicrophone();
  else await publishMicrophone();
}

async function ensureMicrophoneTrack() {
  if (localAudioTrack) return localAudioTrack;
  const { createLocalAudioTrack } = await loadLiveKitClient();
  localAudioTrack = await createLocalAudioTrack({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  return localAudioTrack;
}

async function tryEnsureMicrophoneTrack() {
  try {
    return await ensureMicrophoneTrack();
  } catch (error) {
    addChatMessage("system", "Microfoon niet beschikbaar. Chat-test blijft werken.");
    return null;
  }
}

async function publishMicrophone() {
  if (!room || room.state !== "connected" || isMicrophonePublished) return;
  await ensureMicrophoneTrack();
  await room.localParticipant.publishTrack(localAudioTrack);
  isMicrophonePublished = true;
  micButton.textContent = "Mic uit";
  setStatus("Verbonden · mic aan");
}

async function unpublishMicrophone() {
  if (!localAudioTrack) return;
  if (room?.state === "connected" && isMicrophonePublished) {
    await room.localParticipant.unpublishTrack(localAudioTrack);
  }
  stopMicrophoneTrack();
  micButton.textContent = "Mic aan";
  setStatus("Verbonden · mic uit");
}

function stopMicrophoneTrack() {
  localAudioTrack?.stop();
  localAudioTrack = undefined;
  isMicrophonePublished = false;
}

function cleanupDisconnectedRoom() {
  if (!room) return;
  try {
    room.unregisterRpcMethod("pa_query");
    room.unregisterRpcMethod("pa_action");
  } catch {}
  room.disconnect();
  room = undefined;
}

function registerRoomEvents(activeRoom) {
  const { RoomEvent, Track } = livekitClient;
  activeRoom.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    const audio = track.attach();
    audio.autoplay = true;
    document.body.append(audio);
  });
  activeRoom.on(RoomEvent.Disconnected, () => setStatus("Niet verbonden"));
}

function registerTextStreams(activeRoom) {
  if (!activeRoom.registerTextStreamHandler) return;

  activeRoom.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
    const text = (await reader.readAll()).trim();
    if (!text) return;

    const identity = participantInfo?.identity || "";
    const role = identity.toLowerCase().includes("agent") ? "agent" : "agent";
    addChatMessage(role, text);
  });
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !room || room.state !== "connected") return;

  chatInput.value = "";
  addChatMessage("user", text);
  setStatus("Chatbericht sturen");
  await room.localParticipant.sendText(text, { topic: "lk.chat" });
  setStatus("Verbonden · chat aan");
}

function setChatEnabled(enabled) {
  chatInput.disabled = !enabled;
  chatSendButton.disabled = !enabled;
}

function addChatMessage(role, text) {
  const item = document.createElement("li");
  item.className = `chat-message ${role}`;
  item.textContent = text;
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function registerRpcBridge(activeRoom) {
  activeRoom.registerRpcMethod("pa_query", async (data) => {
    const query = JSON.parse(data.payload || "{}");
    switch (query.type) {
      case "calendar":
        return JSON.stringify({ events });
      case "emails": {
        const folder = query.folder || "inbox";
        return JSON.stringify({
          emails: emails.filter((mail) => !mail.archived && mail.folder === folder),
        });
      }
      case "email_detail": {
        const email = emails.find((mail) => mail.id === query.id);
        if (!email) throw new Error(`Email not found: ${query.id}`);
        return JSON.stringify({ email });
      }
      case "search_emails": {
        const q = String(query.q || "").toLowerCase();
        return JSON.stringify({
          emails: emails.filter((mail) =>
            [mail.subject, mail.from, mail.body, ...mail.to]
              .join(" ")
              .toLowerCase()
              .includes(q),
          ),
        });
      }
      case "contacts":
        return JSON.stringify({ contacts });
      case "missed_calls":
        return JSON.stringify({ missed_calls: missedCalls.filter((call) => !call.handled) });
      case "notes":
        return JSON.stringify({ notes: visualNotes });
      default:
        throw new Error(`Unknown query type: ${query.type}`);
    }
  });

  activeRoom.registerRpcMethod("pa_action", async (data) => {
    const action = JSON.parse(data.payload || "{}");
    const created = applyAction(action);
    lastAction = normalizeVisualAction(action, created);
    visualRevision += 1;
    renderWerkbank();
    return JSON.stringify({ ok: true, action: action.type, created });
  });
}

function applyAction(action) {
  switch (action.type) {
    case "move_event":
      events = events.map((event) =>
        event.id === action.id
          ? {
              ...event,
              previousStart: event.startTime,
              previousEnd: event.endTime,
              startTime: action.startTime,
              endTime: action.endTime || event.endTime,
              moved: true,
              day: "nu",
            }
          : event,
      );
      return events.find((event) => event.id === action.id);
    case "create_event": {
      const created = {
        id: `evt-${Date.now()}`,
        title: action.title,
        startTime: action.startTime,
        endTime: action.endTime,
        attendees: action.attendees || [],
        kind: action.kind || "new",
        color: "#d6ff02",
        moved: true,
      };
      events = [...events, created].sort((a, b) => a.startTime.localeCompare(b.startTime));
      return created;
    }
    case "delete_event": {
      const removed = events.find((event) => event.id === action.id);
      events = events.filter((event) => event.id !== action.id);
      return removed;
    }
    case "update_event": {
      events = events.map((event) =>
        event.id === action.id
          ? {
              ...event,
              title: action.title || event.title,
              attendees: action.attendees || event.attendees,
              moved: true,
            }
          : event,
      );
      return events.find((event) => event.id === action.id);
    }
    case "reply_email":
    case "draft_reply_email":
      {
        const source = emails.find((mail) => mail.id === action.id);
        const recipient = source?.from || "contact";
        const isDraft = action.type === "draft_reply_email";
        const created = {
          id: `${mailVisualPrefix(recipient)}-${++nextMailId}`,
          from: user.name,
          fromInitials: user.initials,
          to: [recipient],
          subject: source?.subject?.startsWith("Re:")
            ? source.subject
            : `Re: ${source?.subject || "antwoord"}`,
          preview: String(action.body || "").slice(0, 80),
          body: action.body || "",
          date: new Date().toISOString(),
          read: true,
          archived: false,
          starred: false,
          replied: false,
          folder: isDraft ? "draft" : "sent",
          composedByAgent: true,
        };
        emails = [
          created,
          ...emails.map((mail) =>
            mail.id === action.id
              ? { ...mail, replied: !isDraft || mail.replied, read: true }
              : mail,
          ),
        ];
        return created;
      }
    case "mark_read":
    case "mark_unread":
    case "archive_email":
    case "toggle_star":
      emails = emails.map((mail) =>
        mail.id === action.id ? updateEmailForAction(mail, action) : mail,
      );
      return emails.find((mail) => mail.id === action.id);
    case "compose_email":
    case "draft_email":
    case "send_message":
    case "draft_message": {
      const recipient = action.to?.[0] || "onbekend";
      const isDraft = action.type === "draft_email" || action.type === "draft_message";
      const created = {
        id: `${mailVisualPrefix(recipient)}-${++nextMailId}`,
        from: user.name,
        fromInitials: user.initials,
        to: action.to || [recipient],
        subject: action.subject || `Bericht aan ${recipient}`,
        preview: String(action.body || "").slice(0, 80),
        body: action.body || "",
        date: new Date().toISOString(),
        read: true,
        archived: false,
        starred: false,
        replied: false,
        folder: isDraft ? "draft" : "sent",
        composedByAgent: true,
      };
      emails = [created, ...emails];
      if (action.type === "send_message") {
        missedCalls = missedCalls.map((call) =>
          (action.to || []).some((to) => to.toLowerCase() === call.from.toLowerCase())
            ? { ...call, handled: true }
            : call,
        );
      }
      return created;
    }
    case "forward_email":
      {
        const source = emails.find((mail) => mail.id === action.id);
        const recipient = action.to?.[0] || "contact";
        const created = {
          id: `${mailVisualPrefix(recipient)}-${++nextMailId}`,
          from: user.name,
          fromInitials: user.initials,
          to: action.to || [recipient],
          subject: source?.subject?.startsWith("Fwd:")
            ? source.subject
            : `Fwd: ${source?.subject || "bericht"}`,
          preview: String(action.comment || source?.preview || "").slice(0, 80),
          body: `${action.comment || ""}\n\n${source?.body || ""}`.trim(),
          date: new Date().toISOString(),
          read: true,
          archived: false,
          starred: false,
          replied: false,
          folder: "sent",
          composedByAgent: true,
        };
        emails = [created, ...emails];
        return created;
      }
    case "add_note": {
      const lines = Array.isArray(action.lines)
        ? action.lines
        : String(action.body || action.line || action.title || "Notitie")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
      const created = {
        id: `${noteVisualPrefix(action.title)}-${++nextNoteId}`,
        title: action.title || "Notitie",
        lines: lines.length ? lines : [action.title || "Notitie"],
        rotate: visualNotes.length % 2 === 0 ? 2 : -1.5,
      };
      visualNotes = [...visualNotes, created];
      return created;
    }
    default:
      return null;
  }
}

function mailVisualPrefix(recipient) {
  const normalized = String(recipient || "").toLowerCase();
  if (normalized.includes("spectrum") || normalized.includes("marit")) return "m-spectrum";
  if (normalized.includes("leonie")) return "m-leonie";
  if (normalized.includes("marieke")) return "m-marieke";
  if (normalized.includes("mama") || normalized.includes("mam")) return "m-mam";
  if (normalized.includes("pap")) return "m-pap";
  return "mail-out";
}

function noteVisualPrefix(title) {
  const normalized = String(title || "").toLowerCase();
  if (normalized.includes("sprekershuys")) return "n-spreker";
  if (normalized.includes("content")) return "n-meta";
  return "n-note";
}

function updateEmailForAction(mail, action) {
  if (action.type === "mark_read") return { ...mail, read: true };
  if (action.type === "mark_unread") return { ...mail, read: false };
  if (action.type === "archive_email") return { ...mail, archived: true };
  if (action.type === "toggle_star") return { ...mail, starred: !mail.starred };
  return mail;
}

function normalizeVisualAction(action, created) {
  const event = created?.startTime ? created : events.find((item) => item.id === action.id);
  return {
    ...action,
    id: `action-${visualRevision + 1}`,
    eventId: event?.id,
    emailId: created?.folder === "sent" ? created.id : action.id,
    created,
    focusBlock:
      action.type === "move_event"
        ? { from: action.startTime, to: action.endTime || event?.endTime || action.startTime }
        : undefined,
  };
}

function actionCaption(action) {
  switch (action.type) {
    case "move_event":
      return `Agenda verplaatst naar ${action.startTime}`;
    case "create_event":
      return `Nieuw in de agenda: ${action.title}`;
    case "delete_event":
      return "Agenda-item verwijderd.";
    case "update_event":
      return `Agenda bijgewerkt: ${action.title || "details aangepast"}`;
    case "reply_email":
      return "Antwoord geschreven en verstuurd.";
    case "draft_reply_email":
      return "Antwoord staat klaar als concept.";
    case "compose_email":
      return `Mail naar ${action.to?.[0] || "contact"} staat op de werkbank.`;
    case "draft_email":
      return `Conceptmail naar ${action.to?.[0] || "contact"} staat klaar.`;
    case "forward_email":
      return `Mail doorgestuurd naar ${action.to?.[0] || "contact"}.`;
    case "send_message":
      return `Ik heb ${action.to?.[0] || "haar"} alvast een bericht gestuurd.`;
    case "draft_message":
      return `Conceptbericht aan ${action.to?.[0] || "haar"} staat klaar.`;
    case "add_note":
      return `Notitie op de werkbank: ${action.title || "notitie"}.`;
    case "archive_email":
      return "Mail opgeruimd.";
    case "mark_read":
      return "Mail gemarkeerd als gelezen.";
    case "mark_unread":
      return "Mail teruggezet naar ongelezen.";
    case "toggle_star":
      return "Belangrijke mail gemarkeerd.";
    default:
      return "Werkbank bijgewerkt.";
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error || "Onbekende fout");
  setStatus(`Fout: ${message}`);
  connectButton.disabled = false;
}
