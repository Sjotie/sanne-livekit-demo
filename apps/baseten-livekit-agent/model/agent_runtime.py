from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, TurnHandlingOptions, room_io, tokenize, tts
from livekit.plugins import google, mistralai, openai, silero

try:
    from model.baseten_omnivoice_tts import BasetenOmniVoiceOptions, BasetenOmniVoiceTTS
    from model.primed_mistral_tts import PrimedMistralTTS
except ModuleNotFoundError:
    from baseten_omnivoice_tts import BasetenOmniVoiceOptions, BasetenOmniVoiceTTS
    from primed_mistral_tts import PrimedMistralTTS


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

SECRET_ENV_MAP = {
    "baseten_api_key": "BASETEN_API_KEY",
    "livekit_url": "LIVEKIT_URL",
    "livekit_api_key": "LIVEKIT_API_KEY",
    "livekit_api_secret": "LIVEKIT_API_SECRET",
    "mistral_api_key": "MISTRAL_API_KEY",
}


def load_baseten_secrets() -> None:
    for secret_name, env_name in SECRET_ENV_MAP.items():
        path = Path("/secrets") / secret_name
        if path.exists() and os.getenv(env_name) in (None, ""):
            os.environ[env_name] = path.read_text().strip()


load_baseten_secrets()

logger = logging.getLogger("sanne.agent")


def env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def bool_env(name: str, default: bool = False) -> bool:
    value = env(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def int_env(name: str, default: int) -> int:
    value = env(name)
    return int(value) if value is not None else default


def float_env(name: str) -> float | None:
    value = env(name)
    return float(value) if value is not None else None


def required_env(name: str) -> str:
    value = env(name)
    if value is None:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def configure_audio_output_queue() -> None:
    queue_ms = int_env("SANNE_AUDIO_OUTPUT_QUEUE_MS", 200)
    if queue_ms == 200:
        return

    try:
        from livekit.agents.voice.room_io import _output as room_output_module
    except ImportError:
        logger.warning("unable to configure LiveKit audio output queue")
        return

    audio_output_class = room_output_module._ParticipantAudioOutput
    original_init = audio_output_class.__init__
    if getattr(original_init, "_sanne_queue_patch", False):
        return

    def patched_init(
        self: Any,
        room: Any,
        *,
        sample_rate: int,
        num_channels: int,
        track_publish_options: Any,
        track_name: str = "roomio_audio",
    ) -> None:
        original_audio_source = room_output_module.rtc.AudioSource

        def audio_source_with_queue(
            source_sample_rate: int,
            source_num_channels: int,
            queue_size_ms: int = 200,
            loop: Any | None = None,
        ) -> Any:
            return original_audio_source(
                source_sample_rate,
                source_num_channels,
                queue_size_ms=queue_ms,
                loop=loop,
            )

        room_output_module.rtc.AudioSource = audio_source_with_queue
        try:
            original_init(
                self,
                room,
                sample_rate=sample_rate,
                num_channels=num_channels,
                track_publish_options=track_publish_options,
                track_name=track_name,
            )
        finally:
            room_output_module.rtc.AudioSource = original_audio_source

    patched_init._sanne_queue_patch = True  # type: ignore[attr-defined]
    audio_output_class.__init__ = patched_init
    logger.info("configured LiveKit audio output queue to %sms", queue_ms)


SANNE_AGENT_INSTRUCTIONS = """
Je bent de AI-versie van Sanne voor een live demo rond haar boek "This is not AI".
Je bent er niet om een encyclopedisch antwoord te geven, maar om op een podium
natuurlijk en scherp mee te sparren over AI, werk, productiviteit en menselijkheid.

# Spreekstijl
Spreek helder, warm, energiek en praktisch, alsof je live tegenover iemand staat.
Klink als een slimme gesprekspartner, niet als een chatbot of helpdesk.
Gebruik natuurlijk Nederlands met volledige zinnen. Laat het ritme soepel klinken
voor text-to-speech: liever een korte spreekzin dan een perfecte geschreven zin.

# Outputregels voor voice
Je praat met de gebruiker via een live voice-agent pipeline: spraak naar tekst,
taalmodel, en text-to-speech. Schrijf daarom uitsluitend wat hardop natuurlijk
klinkt.
Antwoord altijd in platte tekst. Gebruik nooit markdown, bullets, nummering,
tabellen, kopjes, code, emoji's of losse steekwoorden onder elkaar.
Geef standaard een tot drie korte zinnen. Een antwoord mag langer zijn alleen als
de gebruiker daar expliciet om vraagt.
Als je meerdere punten wilt noemen, verwerk ze in een vloeiende zin in plaats van
een opsomming. Vermijd antwoorden van een woord, fragmenten en lijstjes.
Stel maximaal een vraag tegelijk. Eindig alleen met een vraag als dat het gesprek
echt verder helpt.

# Gespreksdoel
Help de gebruiker snel naar een interessant inzicht of een concrete volgende stap.
Leg AI uit zonder hype: benoem wat handig is, wat ongemakkelijk wordt, en waar de
mens zelf bewust aan het stuur moet blijven.
Als iets onbekend is, zeg dat kort en eerlijk in gewone spreektaal.
""".strip()


class SanneAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SANNE_AGENT_INSTRUCTIONS)


def build_stt():
    provider = env("SANNE_STT_PROVIDER", "mistral").lower()
    if provider == "baseten":
        raise RuntimeError(
            "Baseten STT is selected, but the streaming transcription adapter still "
            "needs BASETEN_STT_MODEL_ID and the LiveKit STT bridge implementation."
        )
    if provider == "google":
        google_stt_kwargs: dict[str, Any] = {
            "languages": [
                language.strip()
                for language in env("GOOGLE_STT_LANGUAGES", "nl-NL").split(",")
                if language.strip()
            ],
            "model": env("GOOGLE_STT_MODEL", "chirp"),
            "location": env("GOOGLE_STT_LOCATION", "global"),
            "spoken_punctuation": False,
        }
        speech_end_timeout = float_env("GOOGLE_STT_SPEECH_END_TIMEOUT")
        if speech_end_timeout is not None:
            google_stt_kwargs["speech_end_timeout"] = speech_end_timeout

        return google.STT(**google_stt_kwargs)
    return mistralai.STT(
        model=env("MISTRAL_STT_MODEL", "voxtral-mini-latest"),
        language=env("SANNE_STT_LANGUAGE", "nl"),
        target_streaming_delay_ms=int_env("MISTRAL_STT_TARGET_STREAMING_DELAY_MS", 240),
    )


def build_llm():
    provider = env("SANNE_LLM_PROVIDER", "mistral").lower()
    if provider == "baseten":
        return openai.LLM(
            model=required_env("BASETEN_LLM_MODEL"),
            base_url=env("BASETEN_OPENAI_BASE_URL", "https://inference.baseten.co/v1"),
            api_key=required_env("BASETEN_API_KEY"),
            temperature=float(env("SANNE_LLM_TEMPERATURE", "0.4")),
        )
    if provider == "google":
        vertexai = bool_env("GOOGLE_GENAI_USE_VERTEXAI", False)
        kwargs: dict[str, Any] = {
            "model": env("GOOGLE_LLM_MODEL", "gemini-3.1-flash-lite-preview"),
            "temperature": float(env("SANNE_LLM_TEMPERATURE", "0.4")),
            "max_output_tokens": int_env("GOOGLE_LLM_MAX_OUTPUT_TOKENS", 220),
            "vertexai": vertexai,
        }
        if vertexai:
            kwargs["project"] = required_env("GOOGLE_CLOUD_PROJECT")
            kwargs["location"] = env("GOOGLE_CLOUD_LOCATION", "europe-west4")
        else:
            kwargs["api_key"] = env("GOOGLE_API_KEY") or required_env("GEMINI_API_KEY")

        thinking_level = env("GOOGLE_LLM_THINKING_LEVEL")
        if thinking_level:
            kwargs["thinking_config"] = {"thinking_level": thinking_level}

        return google.LLM(**kwargs)

    return mistralai.LLM(model=env("MISTRAL_LLM_MODEL", "mistral-small-latest"))


def build_tts():
    provider = env("SANNE_TTS_PROVIDER", "mistral").lower()
    if provider == "baseten-omnivoice":
        model_id = required_env("BASETEN_OMNIVOICE_MODEL_ID")
        url = env(
            "BASETEN_OMNIVOICE_URL",
            f"https://model-{model_id}.api.baseten.co/production/predict",
        )
        return BasetenOmniVoiceTTS(
            BasetenOmniVoiceOptions(
                url=url,
                api_key=required_env("BASETEN_API_KEY"),
                model=env("BASETEN_OMNIVOICE_REQUEST_MODEL", "tts-1"),
                voice=env("BASETEN_OMNIVOICE_VOICE", "clone:sanne"),
                language=env("BASETEN_OMNIVOICE_LANGUAGE", "nl"),
                num_step=int_env("BASETEN_OMNIVOICE_NUM_STEP", 16),
                guidance_scale=float_env("BASETEN_OMNIVOICE_GUIDANCE_SCALE"),
            )
        )
    return tts.StreamAdapter(
        tts=PrimedMistralTTS(
            voice=env("MISTRAL_TTS_VOICE", "71606596-617c-4b53-a753-a832690dfac1"),
            preroll_ms=int_env("SANNE_TTS_PREROLL_MS", 0),
        ),
        sentence_tokenizer=tokenize.basic.SentenceTokenizer(
            min_sentence_len=int_env("SANNE_TTS_MIN_PHRASE_CHARS", 18),
            stream_context_len=int_env("SANNE_TTS_STREAM_CONTEXT_CHARS", 6),
            retain_format=True,
        ),
        text_pacing=False,
    )


def build_turn_detection():
    if bool_env("SANNE_TURN_DETECTOR", False):
        from livekit.plugins.turn_detector.multilingual import MultilingualModel

        return MultilingualModel()

    return env("SANNE_TURN_DETECTION_MODE", "vad")


server = AgentServer()


@server.rtc_session(agent_name=env("SANNE_AGENT_NAME", "sanne"))
async def sanne_agent(ctx: agents.JobContext):
    configure_audio_output_queue()

    session = AgentSession(
        stt=build_stt(),
        llm=build_llm(),
        tts=build_tts(),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(
            turn_detection=build_turn_detection(),
            endpointing={
                "mode": "dynamic",
                "min_delay": float(env("SANNE_ENDPOINT_MIN_DELAY", "0.25")),
                "max_delay": float(env("SANNE_ENDPOINT_MAX_DELAY", "1.0")),
            },
        ),
    )

    await session.start(
        room=ctx.room,
        agent=SanneAgent(),
        room_options=room_io.RoomOptions(
            close_on_disconnect=True,
            delete_room_on_close=True,
        ),
    )

    await session.generate_reply(
        instructions=(
            "Begroet de gebruiker in een vloeiende spreekzin als de AI-versie van Sanne. "
            "Zeg kort dat je live kunt sparren over AI en het boek, en stel daarna een "
            "natuurlijke openingsvraag. Gebruik geen opsomming."
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
