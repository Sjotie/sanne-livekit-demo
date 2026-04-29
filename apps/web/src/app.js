const statusEl = document.querySelector("#status");
const eventsEl = document.querySelector("#events");
const wsUrlEl = document.querySelector("#wsUrl");
const connectButton = document.querySelector("#connectButton");
const talkButton = document.querySelector("#talkButton");
const clearButton = document.querySelector("#clearButton");

let socket;
let recorder;
let sessionId;

connectButton.addEventListener("click", connect);
talkButton.addEventListener("pointerdown", startTalking);
talkButton.addEventListener("pointerup", stopTalking);
talkButton.addEventListener("pointercancel", stopTalking);
clearButton.addEventListener("click", () => {
  eventsEl.replaceChildren();
});

function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "session.end" }));
    socket.close();
    return;
  }

  sessionId = crypto.randomUUID();
  socket = new WebSocket(wsUrlEl.value.trim());

  socket.addEventListener("open", () => {
    setStatus("Verbonden");
    connectButton.textContent = "Disconnect";
    talkButton.disabled = false;
    send({
      type: "session.start",
      sessionId,
      voiceId: "voice_Sanne_20260413101430",
    });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    addEvent(message);
    if (message.type === "agent.thinking") setStatus("Sanne denkt na");
    if (message.type === "agent.text") setStatus("Sanne antwoordt");
    if (message.type === "audio.done") setStatus("Verbonden");
  });

  socket.addEventListener("close", () => {
    setStatus("Niet verbonden");
    connectButton.textContent = "Connect";
    talkButton.disabled = true;
  });

  socket.addEventListener("error", () => {
    setStatus("Verbindingsfout");
  });
}

async function startTalking() {
  if (!socket || socket.readyState !== WebSocket.OPEN || recorder?.state === "recording") return;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
  setStatus("Luistert");

  recorder.addEventListener("dataavailable", async (event) => {
    if (!event.data.size) return;
    send({
      type: "audio.chunk",
      mimeType: event.data.type,
      data: await blobToBase64(event.data),
    });
  });

  recorder.addEventListener("stop", () => {
    for (const track of stream.getTracks()) track.stop();
    send({ type: "audio.stop" });
    setStatus("Verwerken");
  });

  recorder.start(250);
}

function stopTalking() {
  if (recorder?.state === "recording") recorder.stop();
}

function send(message) {
  socket.send(JSON.stringify(message));
  addEvent({ direction: "client", ...message, data: message.data ? "[audio]" : undefined });
}

function addEvent(message) {
  const item = document.createElement("li");
  item.textContent = JSON.stringify(message);
  eventsEl.prepend(item);
}

function setStatus(label) {
  statusEl.textContent = label;
}

function pickMimeType() {
  const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
