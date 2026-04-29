# Duo-agent — binnenloop voor Sanne's boeklancering

Twee LiveKit-participants ("agent-optimist" en "agent-scepticus") in dezelfde
room, beide met eigen TTS-stem, die met elkaar in gesprek gaan over thema's
uit *This is not AI*. Communicatie verloopt via een gedeelde tekst-bus
(in-process), niet via STT op elkaars audio — dus geen feedback-loop.

## Architectuur op de avond

```
  ┌─────────────────────────┐                ┌─────────────────────────┐
  │  Laptop 1 (links)       │                │  Laptop 2 (rechts)      │
  │  Browser fullscreen op: │                │  Browser fullscreen op: │
  │  /?screen=optimist      │                │  /?screen=scepticus     │
  │                         │                │                         │
  │  ▶ subscribet alleen    │                │  ▶ subscribet alleen    │
  │    op agent-optimist    │                │    op agent-scepticus   │
  │  ▶ HDMI/screen-share    │                │  ▶ HDMI/screen-share    │
  │    naar scherm L        │                │    naar scherm R        │
  └────────────┬────────────┘                └────────────┬────────────┘
               │                                          │
               └──────────┐         room          ┌───────┘
                          ▼      "binnenloop"     ▼
                 ┌──────────────────────────────────────┐
                 │  duo_agent.py (1 Python proces)      │
                 │  ▶ rtc.Room()  →  agent-optimist     │
                 │  ▶ rtc.Room()  →  agent-scepticus    │
                 │  ▶ shared in-process tekst-bus       │
                 │  ▶ Mistral TTS (2 voice IDs)         │
                 │  ▶ Gemini LLM (2 persona prompts)    │
                 └──────────────────────────────────────┘
```

## Required env vars (`agent/.env.local`)

```bash
LIVEKIT_URL=wss://<jouw-livekit-instance>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

MISTRAL_API_KEY=...

# Voor de LLM. Zonder deze gebruikt het script een statische fallback-tekst.
GOOGLE_API_KEY=...

# Mistral voice IDs — vervang door geclonede stemmen voor het event.
DUO_VOICE_OPTIMIST=71606596-617c-4b53-a753-a832690dfac1
DUO_VOICE_SCEPTICUS=<andere-mistral-voice-id>

# Default room name (matcht /duo-token endpoint default).
DUO_ROOM_NAME=binnenloop
```

## Start de Python agent

```bash
cd apps/pa-dashboard/agent
uv sync                       # pas op: pyproject.toml is voor PA-agent;
                              #         duo_agent gebruikt dezelfde deps
uv run python duo_agent.py
```

De agent connect direct, beide tracks worden gepubliceerd, en het script
begint de cyclische dialoog.

## Start de frontend

```bash
cd apps/pa-dashboard
bun install
bun run dev          # of: bun run build && bun run start (voor podium-stabiliteit)
```

## Op de podium-avond

1. **Eén laptop draait `duo_agent.py`** (niet zichtbaar; eventueel onder de tafel).
2. **Laptop links** opent in Chrome:  
   `http://<host>:5174/?screen=optimist`  
   → Cmd+Shift+F (fullscreen) → HDMI naar scherm links.
3. **Laptop rechts** opent in Chrome:  
   `http://<host>:5174/?screen=scepticus`  
   → fullscreen → HDMI naar scherm rechts.
4. Beide schermen tonen alleen hun eigen agent (grote orb, naam, live caption).
   Audio van de eigen agent komt uit de aangesloten laptop-speaker.
5. Sanne's binnenloop-publiek ziet links de Optimist, rechts de Scepticus,
   beide pratend door elkaar over thema's uit het boek.

## Hoe je 'm stopt

`Ctrl-C` in het Python-proces. Beide rooms disconnecten netjes.

## Hoe je topics aanpast

Edit `agent/duo_topics.json` — een array van onderwerpen + max-turns en pause
tussen turns. Het script kiest random een topic en wisselt na N turns.

## Bekende beperkingen (eerlijk)

- **Conversatie kan ontsporen** na 8-12 turns. Vandaar `max_turns_per_topic: 8`
  + topic-rotation. Probeer voor de avond meerdere doorlopen, schrijf de
  beste 30 minuten op, en hou eventueel een pre-rendered backup-audio klaar.
- **Personas vervagen** als je `temperature` hoog zet. 0.85 is OK,
  maar test 'm voor het event.
- **Bij Mistral-TTS hiccups**: het script slaat één turn over en gaat door.
  Gebruik gerust niet-Sanne-voices voor moment 1, of een gekloonde stem
  voor één van de twee.
- **Geen mens-onderbrekingen**: Sanne kan niet inbreken in de loop. Als dat
  nodig is op de avond, voeg dan een keyboard-shortcut toe in BinnenloopScreen
  die een data-message stuurt met `{type: "interrupt"}` — duo-agent kan
  daarop reageren door de huidige speaker te muten.

## Troubleshooting

- **Niets te horen op laptop**: check dat Chrome autoplay voor die origin
  toestaat; klik één keer in het venster zodat audio mag spelen.
- **Beide schermen horen elkaars audio dubbel**: subscribe-filter werkt op
  participant.identity. Check dat `agent-optimist` / `agent-scepticus` de
  exacte identities zijn (zie logs van duo_agent.py).
- **TTS klinkt fout**: `DUO_VOICE_OPTIMIST` of `DUO_VOICE_SCEPTICUS` env-var
  ontbreekt — script valt terug op default voice voor allebei (klinkt dan
  identiek).
