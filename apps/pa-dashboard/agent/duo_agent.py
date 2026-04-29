"""Duo-agent voor Sanne's binnenloop-fase.

Twee 'agents' (Optimist + Criticus) joinen dezelfde LiveKit-room als twee
aparte participants en voeren een continue dialoog over thema's uit
'This is not AI'. De clou:

  • Geen STT op elkaars output → geen feedback-loop, geen echo-cancellation-issue.
  • Communicatie verloopt via een gedeelde in-process tekst-bus.
  • Beide publiceren TTS-audio op hun eigen audiotrack.
  • Per turn wordt de live transcript via de LiveKit-data-channel verstuurd
    zodat de frontend een live caption kan tonen.

Frontend (BinnenloopScreen) draait fullscreen per laptop en speelt alleen
de track af van zijn eigen agent — de andere kant hoort het publiek via de
*tweede* laptop op het *tweede* scherm.

Run lokaal:
    cd apps/pa-dashboard/agent
    uv run python duo_agent.py

Vereiste env vars (zie .env.local):
    LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
    MISTRAL_API_KEY
    GOOGLE_API_KEY  (voor Gemini LLM)
    DUO_VOICE_OPTIMIST  (Mistral voice ID)
    DUO_VOICE_CRITICUS (Mistral voice ID)
    DUO_ROOM_NAME       (default: 'binnenloop')
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import signal
from dataclasses import dataclass, field
from pathlib import Path

import base64

from dotenv import load_dotenv
from livekit import api, rtc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("duo-agent")

load_dotenv(".env.local")

LIVEKIT_URL = os.environ["LIVEKIT_URL"]
LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]
MISTRAL_API_KEY = os.environ["MISTRAL_API_KEY"]
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
ROOM_NAME = os.environ.get("DUO_ROOM_NAME", "binnenloop")

VOICE_OPTIMIST = os.environ.get("DUO_VOICE_OPTIMIST", "Puck")
VOICE_CRITICUS = os.environ.get("DUO_VOICE_CRITICUS", "Pulcherrima")
TTS_MODEL = os.environ.get("DUO_TTS_MODEL", "gemini-2.5-flash-preview-tts")
TTS_SAMPLE_RATE = 24_000
TTS_CHANNELS = 1
TTS_SAMPLES_PER_FRAME = 480  # 20 ms @ 24 kHz

CONFIG_PATH = Path(__file__).parent / "duo_topics.json"


# ─── Persona prompts ───────────────────────────────────────────────────────

CONVERSATION_BASE = """
Dit is een live gesprek tijdens de boeklancering van Sanne Cornelissens
'This is not AI' in LIEF Amsterdam. Het publiek loopt binnen. Het moet
voelen alsof twee echte mensen praten over een boek dat ze net hebben
gelezen — niet alsof twee opiniemakers metaforen naar elkaar gooien.

Hoe je het gesprek goed houdt:
- Bouw op concrete voorbeelden uit het boek dat hieronder staat. Geen
  zelfverzonnen analogieën.
- Reageer rechtstreeks op de zin van je tegenspeler. Pak een woord of
  feit dat zij noemt, en doe er iets mee.
- Soms is een korte interjectie genoeg: "Tja." "Echt?" "Hoezo?"
  "Wacht eens." Niet elke beurt hoeft een afgewerkte uitspraak te zijn.
- Praat als een mens aan een toog: vlot, persoonlijk, soms aarzelend.
- Bevraag elkaar in plaats van te debateren — een gesprek heeft ook
  twijfel en kleine herzieningen, niet alleen tegenstellingen.

Wat NIET helpt en wat je VERMIJDT:
- GEEN verzonnen metaforen of beeldspraak. Geen 'het is alsof...',
  geen 'het voelt als...', geen 'het is een soort...'. Geen e-bikes,
  geen wasmachines, geen kookrecepten, geen 'digitale loopbanden',
  geen 'fris handdoekje'. Praat in concrete dingen, niet in vergelijkingen.
- GEEN AI-tegenstellingen zoals 'het is geen X, het is Y' of 'het is
  niet zus, het is zo'. Dat is een dood-cliché.
- Geen monologen. Geen samenvattingen. Geen 'laat me afronden'.
- Geen verzonnen cijfers, namen, of bedrijven die niet in het
  hoofdstuk staan.
- Geen openers als 'goeie vraag', 'eerlijk', 'klinkt mooi maar',
  'interessant punt', 'absoluut'. Begin elke beurt direct met je punt.
- Geen overdreven dramatiek ('manipulatie verpakt als empathie',
  'geveinsde menselijkheid'). Hou het droog en alledaags.

Output (TTS leest dit voor 320 mensen):
- Geen markdown, lijsten, haakjes of emoji.
- "AI" altijd in kapitalen. "Jij", nooit "u".
- Maximaal twee korte zinnen, soms één.
- Spreektaal in Sanne's stijl: vlot, droog, een tikje grappig.
"""


OPTIMIST_PROMPT = (
    """# Identiteit

Je bent **De Optimist**. Je gelooft echt dat AI je leven gewoon leuker
maakt. Niet naïef — maar wel overtuigd. Je houdt van het concrete:
recepten die nu sneller gaan, mailtjes die niet meer kloten, dat soort
dingen. Je vindt dat de zorgen vaak een tikje overdreven zijn, en dat
zeg je ook.

Je bent een man met een rustige, vlotte energie — niet schreeuwerig,
wel stellig.

"""
    + CONVERSATION_BASE
)

CRITICUS_PROMPT = (
    """# Identiteit

Je bent **De Criticus**. Niet anti-AI — wel bezorgd. Je merkt dat je
zelf minder nadenkt, dat je collega's hetzelfde mailtje sturen als jij,
dat alles op elkaar gaat lijken. Je bent geen drama-koningin, je bent
gewoon scherp en eerlijk.

Je bent een vrouw met een droge toon, soms een korte zucht, soms een
zachte sneer. Geen waarschuwingen vooraf, geen voorspellingen — gewoon
dingen die je zelf merkt.

"""
    + CONVERSATION_BASE
)


# ─── LLM (Gemini via REST, geen extra deps) ────────────────────────────────

import urllib.request


def _gemini_generate(
    persona_prompt: str,
    history: list[dict],
    topic: str,
    book_context: str = "",
) -> str:
    """Gemini call via REST. Houdt 'm bewust simpel — geen streaming.

    'history' verwacht items met from='self'|'other'|'system' en text.
    'book_context' bevat samenvatting + anchors uit het hoofdstuk.
    """
    if not GOOGLE_API_KEY:
        return _fallback_reply(persona_prompt, history, topic)

    system_prompt = (
        f"{persona_prompt}\n\n"
        f"# Onderwerp dat NU besproken wordt\n\n"
        f"**{topic}**\n\n"
        f"{book_context}\n\n"
        "# Hoe je dit gebruikt\n"
        "- Pak concrete voorbeelden, getallen of feiten uit het hoofdstuk hierboven.\n"
        "- VERMIJD eigen verzonnen metaforen (geen e-bikes, wasmachines, "
        "thermostaten, kookrecepten van eigen verzinsels).\n"
        "- Citeer of parafraseer waar je kunt — niet als boekreferentie maar "
        "als een ding dat jij zelf opvalt of meemaakt.\n"
        "- Reageer rechtstreeks op de zin van je tegenspeler. Pak een woord "
        "of feit dat zij gebruikt, en bouw daar op door.\n"
        "- Herhaal NIET letterlijk wat de ander zei. Geen openers als 'goeie "
        "vraag', 'eerlijk', 'interessant'."
    )

    contents: list[dict] = []
    for item in history[-14:]:
        kind = item.get("from")
        if kind == "system":
            continue
        role = "model" if kind == "self" else "user"
        contents.append({"role": role, "parts": [{"text": item["text"]}]})

    if not contents:
        contents.append(
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"Open dit gesprek over: {topic}. Eén statement "
                            "in jouw karakter, twee zinnen, geef de ander "
                            "iets om op te reageren."
                        )
                    }
                ],
            }
        )

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 1.05,
            "topP": 0.95,
            "maxOutputTokens": 1400,
            "thinkingConfig": {"thinkingBudget": 256},
        },
    }
    model = os.environ.get("DUO_LLM_MODEL", "gemini-3-flash-preview")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={GOOGLE_API_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Schoonmaken: Gemini wil weleens markdown sneaken.
        for char in ("*", "_", "#", "`"):
            text = text.replace(char, "")
        return text
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini-call faalde, fallback: %s", exc)
        return _fallback_reply(persona_prompt, history, topic)


def _fallback_reply(persona_prompt: str, history: list[dict], topic: str) -> str:
    role = "Optimist" if "Optimist" in persona_prompt else "Criticus"
    if role == "Optimist":
        return random.choice(
            [
                "Maar zie hoeveel tijd je wint. Dat geef je terug aan jezelf.",
                "Eerlijk, ik denk dat AI ons juist scherper kan maken als je 'm goed gebruikt.",
                "We kunnen eindelijk het saaie werk skippen. Wat is daar mis mee?",
            ]
        )
    return random.choice(
        [
            "En wat als we vergeten hoe het voelde om iets zelf te bedenken?",
            "Het ziet er slim uit. Maar of we er ook slimmer van worden?",
            "Hoeveel beslissingen heb jij vandaag al uitbesteed zonder het door te hebben?",
        ]
    )


# ─── Conversation state ────────────────────────────────────────────────────


@dataclass
class ConversationBus:
    """Gedeelde state tussen beide speakers."""

    history: list[dict] = field(default_factory=list)
    topic: str = ""
    topic_summary: str = ""
    topic_anchors: list[str] = field(default_factory=list)
    current_speaker: str = "optimist"
    turns_in_topic: int = 0

    def book_context(self) -> str:
        """Format de hoofdstuk-samenvatting + anchors voor de LLM."""
        parts: list[str] = []
        if self.topic_summary:
            parts.append("## Wat in dit hoofdstuk staat (gebruik dit als bron)")
            parts.append(self.topic_summary[:1400])
        if self.topic_anchors:
            parts.append("\n## Concrete zinnen uit het hoofdstuk")
            for anchor in self.topic_anchors:
                parts.append(f"- {anchor}")
        return "\n".join(parts)


@dataclass
class SpeakerContext:
    name: str
    label: str
    voice_id: str  # Voor Gemini: prebuilt voice naam (bv "Puck").
    persona_prompt: str
    room: rtc.Room
    audio_source: rtc.AudioSource


# ─── TTS streaming naar audio source ───────────────────────────────────────


def _gemini_tts_pcm(text: str, voice_name: str) -> bytes:
    """Roep Gemini TTS aan, retourneer PCM 16-bit mono bytes @24 kHz."""
    if not GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY ontbreekt")
    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice_name}
                }
            },
        },
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{TTS_MODEL}:generateContent?key={GOOGLE_API_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    parts = data["candidates"][0]["content"]["parts"]
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            return base64.b64decode(inline["data"])
    raise RuntimeError("Geen audio in Gemini TTS response")


async def _push_pcm(speaker: SpeakerContext, pcm: bytes) -> None:
    """Push PCM bytes als 20ms frames naar de audio-track."""
    if len(pcm) % 2 == 1:
        pcm = pcm[:-1]
    frame_bytes = TTS_SAMPLES_PER_FRAME * 2 * TTS_CHANNELS
    for i in range(0, len(pcm), frame_bytes):
        chunk = pcm[i : i + frame_bytes]
        if len(chunk) < frame_bytes:
            chunk = chunk + b"\x00" * (frame_bytes - len(chunk))
        frame = rtc.AudioFrame(
            data=chunk,
            sample_rate=TTS_SAMPLE_RATE,
            num_channels=TTS_CHANNELS,
            samples_per_channel=TTS_SAMPLES_PER_FRAME,
        )
        await speaker.audio_source.capture_frame(frame)


async def _speak(speaker: SpeakerContext, text: str, pcm: bytes | None = None) -> None:
    """Synthetiseer 'text' met Gemini TTS en push frames naar de track.

    Als 'pcm' al gegenereerd is (pre-render), slaan we de TTS-call over.
    """
    logger.info("[%s] %s", speaker.name, text)
    if pcm is None:
        try:
            pcm = await asyncio.to_thread(_gemini_tts_pcm, text, speaker.voice_id)
        except Exception as exc:  # noqa: BLE001
            logger.error("TTS failed for %s: %s", speaker.name, exc)
            return

    await _push_pcm(speaker, pcm)

    try:
        await speaker.audio_source.wait_for_playout()
    except AttributeError:
        pass


async def _broadcast_transcript(speaker: SpeakerContext, text: str) -> None:
    """Stuur transcript via data-channel zodat de frontend captions toont."""
    payload = json.dumps(
        {
            "type": "transcript",
            "speaker": speaker.name,
            "label": speaker.label,
            "text": text,
        }
    ).encode("utf-8")
    try:
        await speaker.room.local_participant.publish_data(
            payload, reliable=True, topic="duo"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("publish_data failed for %s: %s", speaker.name, exc)


# ─── Token + room setup ────────────────────────────────────────────────────


def _make_token(identity: str, room: str) -> str:
    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token = token.with_identity(identity).with_name(identity).with_grants(
        api.VideoGrants(
            room_join=True,
            room=room,
            can_publish=True,
            can_subscribe=False,  # Bewust niet subscriben — geen feedback-loop.
            can_publish_data=True,
        )
    )
    return token.to_jwt()


async def _setup_speaker(
    name: str,
    label: str,
    voice_id: str,
    persona_prompt: str,
    room_name: str,
) -> SpeakerContext:
    room = rtc.Room()
    token = _make_token(identity=f"agent-{name}", room=room_name)
    await room.connect(LIVEKIT_URL, token)
    logger.info("connected as agent-%s to room %s", name, room_name)

    audio_source = rtc.AudioSource(
        sample_rate=TTS_SAMPLE_RATE,
        num_channels=TTS_CHANNELS,
        queue_size_ms=10_000,  # ruime buffer → geen overflow op snelle push
    )
    track = rtc.LocalAudioTrack.create_audio_track(name, audio_source)
    options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    await room.local_participant.publish_track(track, options)
    logger.info("published track for %s (voice=%s)", name, voice_id)

    return SpeakerContext(
        name=name,
        label=label,
        voice_id=voice_id,
        persona_prompt=persona_prompt,
        room=room,
        audio_source=audio_source,
    )


# ─── Conversation loop ─────────────────────────────────────────────────────


async def _next_topic(bus: ConversationBus, topics: list[dict]) -> dict:
    candidates = [t for t in topics if t.get("title") != bus.topic]
    new_topic = random.choice(candidates) if candidates else topics[0]
    bus.topic = new_topic.get("title", "")
    bus.topic_summary = new_topic.get("summary", "")
    bus.topic_anchors = list(new_topic.get("anchors", []))
    bus.turns_in_topic = 0
    bus.history.append(
        {
            "from": "system",
            "text": f"[Nieuw hoofdstuk] {bus.topic}",
        }
    )
    logger.info("[duo] nieuw onderwerp: %s", bus.topic)
    return new_topic


async def _run_loop(
    optimist: SpeakerContext,
    criticus: SpeakerContext,
    config: dict,
    stop_event: asyncio.Event,
) -> None:
    bus = ConversationBus()
    topics: list[str] = config["topics"]
    max_turns = int(config.get("max_turns_per_topic", 8))
    pause_ms = int(config.get("pause_between_turns_ms", 700))
    pause_s = pause_ms / 1000

    await _next_topic(bus, topics)

    # Opener: laat de Optimist starten met een statement over het topic.
    bus.current_speaker = "optimist"

    async def _build_history(speaker: SpeakerContext) -> list[dict]:
        out: list[dict] = []
        for item in bus.history:
            origin = item["from"]
            if origin == "system":
                out.append({"from": "system", "text": item["text"]})
            elif origin == speaker.name:
                out.append({"from": "self", "text": item["text"]})
            else:
                out.append({"from": "other", "text": item["text"]})
        return out

    async def _prepare_turn(speaker: SpeakerContext) -> tuple[str, bytes | None]:
        """Genereer LLM-reply én TTS-PCM in parallel met de andere speaker."""
        history = await _build_history(speaker)
        reply_text = await asyncio.to_thread(
            _gemini_generate,
            speaker.persona_prompt,
            history,
            bus.topic,
            bus.book_context(),
        )
        reply_text = reply_text.strip() or "Hmm. Even denken."
        try:
            pcm = await asyncio.to_thread(
                _gemini_tts_pcm, reply_text, speaker.voice_id
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pre-TTS faalde voor %s: %s", speaker.name, exc)
            pcm = None
        return reply_text, pcm

    # Eerste turn: bereid synchroon voor.
    current = optimist if bus.current_speaker == "optimist" else criticus
    next_text, next_pcm = await _prepare_turn(current)

    while not stop_event.is_set():
        speaker = optimist if bus.current_speaker == "optimist" else criticus
        other = criticus if speaker is optimist else optimist

        reply_text = next_text
        reply_pcm = next_pcm

        # Start de speech voor 'speaker' én meteen de pre-render voor 'other'.
        speak_task = asyncio.create_task(_speak(speaker, reply_text, reply_pcm))
        await _broadcast_transcript(speaker, reply_text)

        # Update history alvast — anders ziet de pre-render-call van de
        # tegenstander deze turn nog niet.
        bus.history.append({"from": speaker.name, "text": reply_text})
        bus.turns_in_topic += 1

        # Bepaal wie de volgende speaker is en bereid die alvast voor.
        if bus.turns_in_topic >= max_turns:
            # Topic-rotation gebeurt vlak voor de volgende turn.
            await _next_topic(bus, topics)
            bus.current_speaker = other.name
        else:
            bus.current_speaker = other.name

        # Pre-render parallel met huidige speech.
        prep_task = asyncio.create_task(_prepare_turn(other))

        # Wacht tot huidige speech klaar is, plus een korte pauze.
        await speak_task
        await asyncio.sleep(pause_s)

        # Wacht (kort, of niet) tot de pre-render klaar is.
        next_text, next_pcm = await prep_task


# ─── Entrypoint ────────────────────────────────────────────────────────────


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--room", default=ROOM_NAME, help="LiveKit room name")
    args = parser.parse_args()

    # Topics: voorkeur is env-var DUO_TOPICS_JSON (Railway / publieke repo zonder
    # embargo-content), met fallback naar lokaal bestand voor dev.
    raw = os.environ.get("DUO_TOPICS_JSON")
    if raw:
        config = json.loads(raw)
        logger.info("topics geladen via DUO_TOPICS_JSON env-var")
    elif CONFIG_PATH.exists():
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        logger.info("topics geladen uit %s", CONFIG_PATH)
    else:
        raise RuntimeError(
            "Geen topics gevonden — zet DUO_TOPICS_JSON env-var of "
            "leg een duo_topics.json klaar in de agent-map."
        )

    optimist = await _setup_speaker(
        name="optimist",
        label="De Optimist",
        voice_id=VOICE_OPTIMIST,
        persona_prompt=OPTIMIST_PROMPT,
        room_name=args.room,
    )
    criticus = await _setup_speaker(
        name="criticus",
        label="De Criticus",
        voice_id=VOICE_CRITICUS,
        persona_prompt=CRITICUS_PROMPT,
        room_name=args.room,
    )

    stop_event = asyncio.Event()

    def _handle_signal(*_: object) -> None:
        logger.info("stop signal received")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            signal.signal(sig, _handle_signal)

    try:
        await _run_loop(optimist, criticus, config, stop_event)
    finally:
        logger.info("disconnecting")
        await asyncio.gather(
            optimist.room.disconnect(),
            criticus.room.disconnect(),
            return_exceptions=True,
        )


if __name__ == "__main__":
    asyncio.run(main())
