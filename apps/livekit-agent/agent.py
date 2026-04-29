from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, TurnHandlingOptions, room_io
from livekit.plugins import mistralai, noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel


ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def env(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value not in (None, "") else default


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


server = AgentServer()


@server.rtc_session(agent_name="sanne")
async def sanne_agent(ctx: agents.JobContext):
    session = AgentSession(
        stt=mistralai.STT(model="voxtral-mini-latest", language="nl"),
        llm=mistralai.LLM(model="mistral-small-latest"),
        tts=mistralai.TTS(
            voice=env("MISTRAL_TTS_VOICE", "71606596-617c-4b53-a753-a832690dfac1")
        ),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
            endpointing={"mode": "dynamic", "min_delay": 0.3, "max_delay": 1.5},
        ),
    )

    await session.start(
        room=ctx.room,
        agent=SanneAgent(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
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
