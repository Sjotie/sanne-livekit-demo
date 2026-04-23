import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
} from "https://esm.sh/livekit-client@2.15.13";

const statusEl = document.querySelector("#status");
const eventsEl = document.querySelector("#events");
const roomNameEl = document.querySelector("#roomName");
const connectButton = document.querySelector("#connectButton");
const micButton = document.querySelector("#micButton");

let room;
let localAudioTrack;

connectButton.addEventListener("click", toggleConnection);
micButton.addEventListener("click", toggleMicrophone);

async function toggleConnection() {
  if (room?.state === "connected") {
    await disconnect();
    return;
  }

  const roomName = roomNameEl.value.trim() || "sanne-demo";
  setStatus("Token ophalen");
  const tokenResponse = await fetch("/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room: roomName,
      room_config: { agents: [{ agent_name: "sanne" }] },
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.json();
    setStatus(error.error || "Token fout");
    addEvent("token.error", error);
    return;
  }

  const { server_url: serverUrl, participant_token: token, identity, agentName } =
    await tokenResponse.json();
  room = new Room({ adaptiveStream: true, dynacast: true });
  registerRoomEvents(room);

  setStatus("Verbinden");
  await room.connect(serverUrl, token);
  connectButton.textContent = "Disconnect";
  micButton.disabled = false;
  setStatus(`Verbonden als ${identity} · agent ${agentName}`);
}

async function disconnect() {
  if (localAudioTrack) {
    await room.localParticipant.unpublishTrack(localAudioTrack);
    localAudioTrack.stop();
    localAudioTrack = undefined;
  }
  room.disconnect();
  room = undefined;
  connectButton.textContent = "Connect";
  micButton.textContent = "Mic aan";
  micButton.disabled = true;
  setStatus("Niet verbonden");
}

async function toggleMicrophone() {
  if (!room || room.state !== "connected") return;

  if (localAudioTrack) {
    await room.localParticipant.unpublishTrack(localAudioTrack);
    localAudioTrack.stop();
    localAudioTrack = undefined;
    micButton.textContent = "Mic aan";
    addEvent("mic.off");
    return;
  }

  localAudioTrack = await createLocalAudioTrack({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  await room.localParticipant.publishTrack(localAudioTrack);
  micButton.textContent = "Mic uit";
  addEvent("mic.on");
}

function registerRoomEvents(activeRoom) {
  activeRoom.on(RoomEvent.Connected, () => addEvent("room.connected"));
  activeRoom.on(RoomEvent.Disconnected, () => addEvent("room.disconnected"));
  activeRoom.on(RoomEvent.ParticipantConnected, (participant) => {
    addEvent("participant.connected", { identity: participant.identity });
  });
  activeRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
    addEvent("participant.disconnected", { identity: participant.identity });
  });
  activeRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    addEvent("track.subscribed", {
      source: publication.source,
      identity: participant.identity,
    });
    if (track.kind === Track.Kind.Audio) {
      const audio = track.attach();
      audio.autoplay = true;
      document.body.append(audio);
    }
  });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function addEvent(type, payload = {}) {
  const item = document.createElement("li");
  item.textContent = JSON.stringify({ type, ...payload });
  eventsEl.prepend(item);
}
