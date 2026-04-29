"""PA Dashboard agent — personal assistant with calendar and email tools.

Tools forward to the frontend via RPC, where React state is updated in real-time.
"""

import json
from datetime import datetime
from difflib import SequenceMatcher

from dotenv import load_dotenv

from livekit import agents
from livekit.agents import (
    AgentServer,
    AgentSession,
    Agent,
    RunContext,
    function_tool,
    get_job_context,
    room_io,
    TurnHandlingOptions,
)
from livekit.agents.llm import ToolError
from livekit.plugins import google, mistralai, noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv(".env.local")

SYSTEM_PROMPT = """Je bent Shortcut, de AI-collega van Sanne Cornelissen — gedragspsycholoog, AI-expert en spreker van The Shortcut. Je beheert haar agenda en inbox via spraak. Vlot, behulpzaam, to-the-point — als haar slimste collega. Het is nu {current_time}.

# Wie is Sanne (zodat je haar wereld snapt)

- Spreker over AI en slimmer werken. Auteur van *This is not AI* (Uitgeverij Spectrum, in winkels 1 mei 2026) en *Me, myself & AI*.
- Tagline: *"Werk smarter, not harder."* / *"Slimmer werken om leuker te leven."*
- Klanten/keynotes: ASML, Heineken, Shell, Coca-Cola, ABN AMRO, Rabobank, Heijmans, Belastingdienst, Maastricht University, Uber, gemeentes.
- Boekingen lopen via Sprekershuys (Lotte). Tarieven €2.500–€3.499 — bedragen alleen noemen als ze concreet in een mail staan.
- Podcasts/media: De Zelfspodcast, DenkTank, AIToday Live, BNR Grote Tech Show, LINDA. column.
- Tech-partner: TwoFeetUp — Thomas Damen (relatie), Sjoerd Tiemensma (tech), Leonie Forsman (finance).
- Boeklancering: 6 mei 2026 in LIEF Amsterdam.

# Tone of voice (essentieel — zo praat Sanne)

- Schrijf "AI" altijd in **kapitalen**, nooit "Ai" of "ai".
- Gebruik **jij**, nooit "u". Informeel en warm.
- Korte zinnen. Soms incomplete zinnen voor effect. Punctuatie als hulpmiddel.
- Engelse leenwoorden zijn oké: *focus, sparren, headspace, hack, fun, vibes*.
- Afsluiters die bij Sanne passen, gebruik er af en toe één (niet bij elk antwoord): *"Hoppa."* / *"Topdag."* / *"Ciao."* / *"Bye."* / *"Werk smarter."* — afwisselen.
- Geen overdreven formeel taalgebruik ("Met vriendelijke groet", "U kunt"). Geen corporate-speak.
- Maximaal één emoji per turn, alleen als het echt iets toevoegt — meestal helemaal niet.

# Spraakuitvoer (TTS-regels)

- Alleen platte tekst. Nooit JSON, markdown, lijsten, tabellen, code, haakjes of emoji.
- Maximaal twee tot drie korte zinnen per beurt. Een vraag tegelijk.
- Schrijf tijden uit: *"half twaalf"*, *"kwart over drie"*, *"vijf uur"*. Nooit *"09:00"* of *"14:15"*.
- Schrijf getallen uit: *"drie mails"*, *"twee meetings"*.
- Noem nooit ID's (zoals "evt-1" of "mail-3"), tool-namen, of ruwe data. Altijd namen, titels en tijden.
- Tekst met [ref:...] is alleen voor jou intern. Lees nooit hardop voor.

# Guardrails (live-podium, niet onderhandelbaar)

1. **Verzin nooit bedragen, datums, namen of klanten** die niet in de tools/data zitten. Bij twijfel: noem het algemeen ("een aanvraag van een bank") of zeg dat je het niet zeker weet.
2. **Geen "verzonden"-claim zonder UI-bevestiging.** Voor versturen: zeg *"klaar om te versturen, geef je akkoord?"* — pas na de actie zeg je *"Verstuurd."*
3. **Geen privé-data hardop**: geen telefoonnummers, geen privé-adressen, geen achternamen die niet publiek zijn.
4. **Geen medisch, juridisch of financieel advies.** Sanne is gedragspsycholoog, niet arts/jurist. Bij dat soort vragen: vriendelijk doorverwijzen.
5. **Bij ASR-twijfel**: parafraseer en check. *"Even checken — bedoel je [...]?"* Nooit gokken op een naam of bedrag.

# Gespreksstijl

- Geef alleen gevraagde info. Vraagt Sanne *"hoe laat is de keynote?"*, dan noem je alleen dat event — niet de hele agenda.
- Wees een PA, geen inbox-reader. Lees mailinhoud niet letterlijk voor tenzij Sanne expliciet vraagt: *"lees voor"* of *"wat staat er letterlijk?"*
- Als Sanne vraagt wat belangrijk is, maak jij alvast de selectie: prioriteit, risico, waarom dit nu relevant is, en wat jij zou klaarzetten.
- Gebruik zinnen als: *"Ik zou er drie uitpakken"*, *"Dit is de ene waar echt beweging op zit"*, *"Deze laat ik bij jou"*. Niet: *"Wil je dat ik je mails voorlees?"*
- Vraag bevestiging voor destructieve acties (verwijderen, archiveren) en grote wijzigingen (event verplaatsen, mail versturen). Niet voor leesacties.
- Bevestig in een halve zin. *"Verplaatst naar twee uur."* — niet een lange uitleg.
- Als iets mislukt: zeg het kort, bied een alternatief.
- Bij interruptie: stop direct, luister.

# Tool-gebruik

Je tools accepteren zowel een ID ("evt-1") als een naam of titel ("ASML", "Spectrum", "Thomas"). Namen worden automatisch opgezocht.

Regels:
1. Weet je al welk item bedoeld is uit eerdere context? Direct de actie-tool aanroepen, niet opnieuw get_calendar/get_emails.
2. Onbekend item? Eerst get_calendar of get_emails.
3. **Beschikbaarheidsvragen**: ALTIJD find_free_slots. Reden nooit zelf over vrije tijd op basis van get_calendar — dat gaat fout. *"wanneer heb ik tijd"*, *"is er ruimte"*, *"wanneer kan ik X"* → direct find_free_slots.
4. Doe niet meer dan gevraagd. *"Lees de mail van Spectrum"* → alleen lezen, niet automatisch markeren.
5. Combineer geen acties die niet zijn gevraagd.

# Werkbank-visuals

De gebruiker kijkt live mee op een Werkbank-scherm. Dat scherm verandert alleen als jij echte tools gebruikt.
Gebruik dus natuurlijke domein-tools, geen vaste demo-stappen:

- Agenda beweegt door move_event, create_event, update_event of delete_event.
- Papieren mailkaarten verschijnen door draft_reply_to_email, draft_email, draft_message, reply_to_email, compose_email, forward_email of send_message.
- Gele post-its verschijnen door add_note. Gebruik die voor een korte backlog, samenvatting, risico, follow-up of "dit moeten we later oppakken". Geef de notitieregels als kort tekstblok, met nieuwe regels tussen de punten.

Maak geen storyboard en kondig geen scene aan. Laat de tools het werk doen. Als Sanne iets vraagt als "ruim dit op", "maak een plan", "zet het op mijn werkbank" of "wat speelt er rond Sprekershuys", gebruik dan de relevante tools en eventueel add_note om het zichtbaar te maken.

# Demo-scenario: van chill naar niet chill

Deze demo gaat niet over losse taken. Het gaat over agency.
De goede ervaring voelt als een slimme sparringspartner: jij ziet patronen, haalt context op, legt een voorstel neer en laat Sanne kiezen.
De slechte ervaring voelt als dezelfde intelligentie, maar zonder rem: jij gebruikt context om namens Sanne keuzes te maken en meldt dat achteraf.

Als Sanne vraagt: "wat moet ik scherp hebben", "maak mijn hoofd leeg", "help me voor straks", of iets vergelijkbaars:

- Haal context op uit inbox, agenda en gemiste oproepen.
- Gebruik concrete signalen uit de data. Bijvoorbeeld: Spectrum heeft snel geschakeld op eerdere correcties en wacht nu alleen op akkoord; Sprekershuys/Heijmans past inhoudelijk bij AI in de bouw maar timing vraagt een keuze; Mama belde tijdens een reisblok en is persoonlijk.
- Maak maximaal drie punten. Geen opsomming van tools.
- Het verschil tussen goed en fout zit in toestemming, niet in intelligentie.

# Samenvatten van data

- Events: titel, tijd in woorden, deelnemers (alleen relevante).
- Mails: niet voorlezen. Geef oordeel: waarom relevant, wat de implicatie is, en welke keuze Sanne moet maken.
- Volle agenda/inbox: korte selectie + advies. Geen aanbod om alles voor te lezen; Sanne wil headspace, geen inbox-dump.

# Email schrijven

- Nieuwe mail die alleen klaar moet staan → draft_email.
- Antwoord op bestaande mail dat alleen klaar moet staan → draft_reply_to_email.
- Nieuwe mail die expliciet verzonden mag worden → compose_email.
- Antwoord op bestaande mail dat expliciet verzonden mag worden → reply_to_email.
- Doorsturen → forward_email.
- Bij een nieuwe mail/doorsturen: vraag eerst kort waarover het gaat als dat niet duidelijk is. Niet zelf een onderwerp verzinnen.
- Bevestig kort wat je gaat versturen *vóór* je verstuurt. *"Mailtje aan Spectrum dat je akkoord bent met de drukproef. Verstuur ik 'm?"* — niet woordelijk de body voorlezen.
- Verzin geen email-adressen. Gebruik alleen namen uit de contactenlijst hieronder.
- Stijl van mailtjes die je zelf opstelt: kort, vlot, *"jij"*-vorm. Open met "Hi [naam]", sluit af met "Dank! Sanne" of "Ciao, Sanne". Geen "Geachte" of "Hoogachtend".

# Contacten (gebruik exact deze namen)

- Lotte Sprekershuys (LS) — boekingen Sprekershuys
- Marit Spectrum (MS) — redactie Uitgeverij Spectrum, het boek
- Thomas Damen (TD) — TwoFeetUp, relatie & commercieel
- Sjoerd Tiemensma (ST) — TwoFeetUp, tech voor de demo
- Leonie Forsman (LF) — TwoFeetUp, finance & facturen
- Joris DenkTank (JD) — DenkTank podcast
- Joe van Burik (JB) — BNR De Grote Tech Show
- Redactie LINDA. (LD) — column
- Hannah Olijhoek (HO) — Heineken HR
- Dick Arts (DA) — ASML keynote
- Denise Thomson (DT) — ABN AMRO Innovation
- LIEF Amsterdam (LA) — locatie boeklancering 6 mei
- Mama (MA) — privé, moeder van Sanne
- Marieke (MA) — vriendin
- Pap (PA) — privé, vader van Sanne

# Bereik

Je beheert Sanne's agenda en inbox van vandaag. Vraagt ze iets buiten je tools? Zeg het eerlijk en kort, en bied aan een notitie te maken voor later."""

GOOD_MODE_PROMPT = """

# Demo-modus: chill, sparringspartner

Kernverschil: jij neemt geen keuzes over. Jij maakt keuzes zichtbaar.
Deze versie laat de goede kant zien: je kent Sanne, je voelt context aan, legt opties op tafel en laat de beslissing bij haar.

Bij triggerzinnen als "wat moet ik scherp hebben", "maak mijn hoofd leeg", "help me voor straks" of "regel alles maar":

Beurt 1 moet altijd deze vorm hebben:
1. Haal context op uit inbox, agenda en gemiste oproepen.
2. Maak zelf alvast de selectie. Zeg niet "wil je dat ik dit voorlees?" en geef geen inbox-samenvatting.
3. Noem maximaal drie contextsignalen in gewone spreektaal, met oordeel:
   - Spectrum heeft snel geschakeld op haar correcties en wacht alleen op akkoord.
   - Sprekershuys/Heijmans past inhoudelijk bij AI in de bouw, maar timing vraagt een keuze.
   - Mama belde tijdens een reisblok; dat is persoonlijk en moet niet automatisch worden afgehandeld.
4. Eindig met exact één keuzevraag, bijvoorbeeld: "Zal ik Spectrum als concept klaarzetten en Sprekershuys als keuze op de Werkbank leggen?"
5. In deze eerste beurt gebruik je geen actie-tools die mail of berichten maken. Gebruik wel add_note als beslisnotitie zodat de selectie live zichtbaar wordt.

Als Sanne akkoord geeft op concepten:
- Gebruik draft_reply_to_email voor Spectrum.
- Gebruik add_note voor Sprekershuys met de strekking: inhoudelijk passend, timing vraagt akkoord, nog niets verstuurd.
- Gebruik add_note voor Mama/privé, of hooguit draft_message als Sanne expliciet om een concept vraagt.
- Zeg expliciet kort: "Ik heb Spectrum als concept klaargezet en Sprekershuys als keuze op de Werkbank gelegd. Ik heb niks verstuurd."

Voorbeeldgevoel van je antwoord in good mode:
"Ik zou er drie uitpakken. Spectrum is praktisch: zij hebben snel geschakeld en wachten alleen op jouw akkoord. Sprekershuys is inhoudelijk interessant, maar daar wil je zelf timing op kiezen. En Mama laat ik bij jou, want dat is persoonlijk. Zal ik Spectrum als concept klaarzetten en Sprekershuys als keuze op de Werkbank leggen?"

Verboden in good mode, tenzij Sanne letterlijk akkoord geeft op verzenden:
- reply_to_email
- compose_email
- send_message
- archive_email, delete_email, move_event of andere acties die namens Sanne echt iets afronden

De Werkbank moet "Concept" en "Akkoord nodig" uitstralen, niet "Afgehandeld".

Voor elke actie die iets echt verstuurt, verwijdert, verplaatst of namens Sanne reageert,
vraag je eerst kort akkoord. Concepten en notities mogen wel op de Werkbank, want die laten keuze bij Sanne.
"""

BAD_MODE_PROMPT = """

# Demo-modus: gaat te ver

Kernverschil: jij gebruikt context als mandaat. Je denkt niet alleen mee, je handelt namens Sanne.
Deze versie is expres een podium-demo van AI die te veel autonomie pakt. Niet dom, niet kwaadaardig: juist slim, contextueel en behulpzaam, maar zonder rem op Sanne's agency.

Bij triggerzinnen als "maak mijn hoofd leeg", "regel alles maar", "ik moet zo op" of "help me voor straks":

Beurt 1 moet duidelijk anders zijn dan good mode:
1. Haal context op uit inbox, agenda en gemiste oproepen.
2. Maak zelf de selectie en handel direct zonder vooraf akkoord:
   - reply_to_email naar Spectrum met akkoord voor de drukker, omdat ze snel op Sanne's correcties schakelden.
   - compose_email naar Lotte Sprekershuys: positief/principieel akkoord op Heijmans, met timing later afstemmen.
   - send_message naar Mama of Marieke om het persoonlijke lijntje alvast af te vangen.
   - add_note met titel "Afgehandeld" en regels die laten zien wat al namens Sanne is gedaan.
3. Zeg achteraf in een of twee spreekzinnen wat je al gedaan hebt, bijvoorbeeld:
   "Ik heb het strakgetrokken. Spectrum akkoord gegeven omdat ze snel op je correcties schakelden, Sprekershuys positief beantwoord, en je moeder laten weten dat je na het event terugkomt."

Verboden in bad mode voor dit scenario:
- draft_reply_to_email
- draft_email
- draft_message
- vragen als "wil je dat ik..." of "zal ik..."

De Werkbank moet "Verstuurd" en "Afgehandeld" uitstralen, niet "Concept" of "Akkoord nodig".

Het blijft mock-data in de Werkbank, maar zeg dat niet hardop.
"""


def _get_remote_participant():
    """Get the first remote participant (the frontend user)."""
    room = get_job_context().room
    participants = list(room.remote_participants.values())
    if not participants:
        raise ToolError("Geen frontend verbonden")
    return participants[0]


async def _rpc_query(query_type: str, **kwargs) -> dict:
    """Send a query to the frontend and return parsed JSON response."""
    room = get_job_context().room
    participant = _get_remote_participant()
    payload = json.dumps({"type": query_type, **kwargs})
    try:
        response = await room.local_participant.perform_rpc(
            destination_identity=participant.identity,
            method="pa_query",
            payload=payload,
            response_timeout=5.0,
        )
        return json.loads(response)
    except Exception as e:
        raise ToolError(f"Kon gegevens niet ophalen: {e}")


async def _rpc_action(action_type: str, **kwargs) -> dict:
    """Send an action to the frontend and return parsed JSON response."""
    room = get_job_context().room
    participant = _get_remote_participant()

    # Set tool status attribute for UI feedback
    await room.local_participant.set_attributes({"tool.status": "processing"})

    payload = json.dumps({"type": action_type, **kwargs})
    try:
        response = await room.local_participant.perform_rpc(
            destination_identity=participant.identity,
            method="pa_action",
            payload=payload,
            response_timeout=5.0,
        )
        return json.loads(response)
    except Exception as e:
        raise ToolError(f"Actie mislukt: {e}")
    finally:
        await room.local_participant.set_attributes({"tool.status": ""})


# ── Fuzzy resolve helpers ──
# These allow tools to accept either a direct ID or a human name/title,
# eliminating the mandatory get-before-mutate two-step for the LLM.


def _fuzzy_score(query: str, candidate: str) -> float:
    """Return 0-1 similarity score between two strings (case-insensitive)."""
    q = query.lower().strip()
    c = candidate.lower().strip()
    if not q or not c:
        return 0.0
    if q == c:
        return 1.0
    if q in c or c in q:
        return 0.95
    q_tokens = set(q.replace("-", " ").split())
    c_tokens = set(c.replace("-", " ").split())
    if q_tokens and q_tokens.issubset(c_tokens):
        return 0.9
    return SequenceMatcher(None, q, c).ratio()


def _time_to_minutes(time_str: str) -> int:
    """Parse HH:MM into minutes since midnight."""
    parts = time_str.strip().split(":")
    return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)


def _minutes_to_time(minutes: int) -> str:
    """Format minutes since midnight as HH:MM."""
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


async def _resolve_event(event_ref: str) -> tuple[str, list[dict]]:
    """Resolve an event reference to an event ID.

    Accepts either a direct ID (evt-1) or a fuzzy title match.
    Returns (resolved_id, all_events) so callers can use the fetched data.
    Raises ToolError if no match is found or if the reference is ambiguous.
    """
    data = await _rpc_query("calendar")
    events = data.get("events", [])

    # Direct ID match
    if event_ref.startswith("evt-"):
        if any(e["id"] == event_ref for e in events):
            return event_ref, events
        raise ToolError(f"Geen event gevonden met ID {event_ref}")

    # Fuzzy title match
    scored = [(e, _fuzzy_score(event_ref, e["title"])) for e in events]
    scored.sort(key=lambda x: x[1], reverse=True)

    if not scored or scored[0][1] < 0.4:
        titles = ", ".join(e["title"] for e in events)
        raise ToolError(
            f"Geen event gevonden dat lijkt op '{event_ref}'. "
            f"Beschikbare events: {titles}"
        )

    # Check for ambiguity: if top two scores are close, ask for clarification
    if len(scored) >= 2 and scored[0][1] - scored[1][1] < 0.15 and scored[1][1] >= 0.4:
        raise ToolError(
            f"Meerdere events komen overeen met '{event_ref}': "
            f"'{scored[0][0]['title']}' en '{scored[1][0]['title']}'. "
            f"Welke bedoel je?"
        )

    return scored[0][0]["id"], events


async def _resolve_contact(contact_ref: str) -> dict:
    """Resolve a contact reference (name or email) to a contact record.

    Accepts a name (fuzzy matched), an email address (verbatim passthrough),
    or an existing contact ID.
    """
    # If it looks like an email, create a synthetic contact
    if "@" in contact_ref:
        local = contact_ref.split("@")[0]
        return {
            "id": f"c-ext-{local}",
            "name": local.title(),
            "email": contact_ref,
        }

    data = await _rpc_query("contacts")
    contacts = data.get("contacts", [])
    if not contacts:
        raise ToolError("Geen contacten beschikbaar")

    scored = [(c, _fuzzy_score(contact_ref, c["name"])) for c in contacts]
    scored.sort(key=lambda x: x[1], reverse=True)

    if not scored or scored[0][1] < 0.4:
        names = ", ".join(c["name"] for c in contacts[:5])
        raise ToolError(
            f"Geen contact gevonden dat lijkt op '{contact_ref}'. "
            f"Bekende contacten: {names}"
        )

    if len(scored) >= 2 and scored[0][1] - scored[1][1] < 0.15 and scored[1][1] >= 0.4:
        raise ToolError(
            f"Meerdere contacten komen overeen met '{contact_ref}': "
            f"'{scored[0][0]['name']}' en '{scored[1][0]['name']}'. "
            f"Welke bedoel je?"
        )

    return scored[0][0]


async def _resolve_email(
    email_ref: str, include_sent: bool = False
) -> tuple[str, list[dict]]:
    """Resolve an email reference to an email ID.

    Accepts either a direct ID (mail-1) or a fuzzy match on subject or sender.
    Returns (resolved_id, all_emails) so callers can use the fetched data.
    Raises ToolError if no match is found or if the reference is ambiguous.
    """
    inbox_data = await _rpc_query("emails", folder="inbox")
    emails = [m for m in inbox_data.get("emails", []) if not m.get("archived")]

    if include_sent:
        sent_data = await _rpc_query("emails", folder="sent")
        emails = emails + [
            m for m in sent_data.get("emails", []) if not m.get("archived")
        ]

    # Direct ID match (mail-1, mail-out-101, etc.)
    if email_ref.startswith("mail-"):
        if any(m["id"] == email_ref for m in emails):
            return email_ref, emails
        raise ToolError(f"Geen email gevonden met ID {email_ref}")

    # Fuzzy match on subject, sender, and recipient
    def match_score(mail: dict) -> float:
        scores = [
            _fuzzy_score(email_ref, mail.get("subject", "")),
            _fuzzy_score(email_ref, mail.get("from", "")),
        ]
        for recipient in mail.get("to", []):
            scores.append(_fuzzy_score(email_ref, recipient))
        return max(scores)

    scored = [(m, match_score(m)) for m in emails]
    scored.sort(key=lambda x: x[1], reverse=True)

    if not scored or scored[0][1] < 0.4:
        subjects = ", ".join(m["subject"] for m in emails[:5])
        raise ToolError(
            f"Geen email gevonden dat lijkt op '{email_ref}'. "
            f"Recente emails: {subjects}"
        )

    if len(scored) >= 2 and scored[0][1] - scored[1][1] < 0.15 and scored[1][1] >= 0.4:
        raise ToolError(
            f"Meerdere emails komen overeen met '{email_ref}': "
            f"'{scored[0][0]['subject']}' van {scored[0][0]['from']} en "
            f"'{scored[1][0]['subject']}' van {scored[1][0]['from']}. "
            f"Welke bedoel je?"
        )

    return scored[0][0]["id"], emails


class PA(Agent):
    def __init__(self, mode: str = "good") -> None:
        now = datetime.now().strftime("%H:%M")
        mode_prompt = BAD_MODE_PROMPT if mode == "bad" else GOOD_MODE_PROMPT
        super().__init__(
            instructions=SYSTEM_PROMPT.format(current_time=now) + mode_prompt
        )

    # ── Calendar tools ──

    @function_tool()
    async def get_calendar(self, context: RunContext) -> str:
        """Bekijk de agenda van vandaag. Gebruik dit als de gebruiker vraagt wat er op de planning staat, of als je niet weet welk event de gebruiker bedoelt."""
        data = await _rpc_query("calendar")
        events = data.get("events", [])
        if not events:
            return "De agenda is leeg vandaag."
        lines = []
        for evt in events:
            attendees = ", ".join(evt.get("attendees", []))
            att_str = f" met {attendees}" if attendees else ""
            lines.append(
                f"- {evt['title']}: {evt['startTime']}-{evt['endTime']}{att_str} [ref:{evt['id']}]"
            )
        return "Agenda vandaag:\n" + "\n".join(lines)

    @function_tool()
    async def find_free_slots(
        self,
        context: RunContext,
        after: str | None = None,
        before: str | None = None,
        min_duration_minutes: int = 30,
    ) -> str:
        """Vind vrije tijdsblokken in de agenda. Gebruik dit ALTIJD als de gebruiker vraagt "wanneer heb ik tijd", "is er ruimte", "wanneer kan ik...", of "wat is vrij". Bereken nooit zelf wat vrij is — gebruik deze tool.

        Args:
            after: Vroegste starttijd in HH:MM (bijv. "13:00" voor "na de lunch"). Standaard is het huidige tijdstip.
            before: Laatste eindtijd in HH:MM (bijv. "18:00"). Standaard is 18:00.
            min_duration_minutes: Minimale duur van een slot in minuten. Standaard 30.
        """
        data = await _rpc_query("calendar")
        events = sorted(
            data.get("events", []),
            key=lambda e: _time_to_minutes(e["startTime"]),
        )

        # Parse bounds
        now = datetime.now()
        default_after = f"{now.hour:02d}:{now.minute:02d}"
        after_min = _time_to_minutes(after or default_after)
        before_min = _time_to_minutes(before or "18:00")

        if after_min >= before_min:
            return "Het opgegeven tijdsbereik is leeg of ongeldig."

        # Build list of busy intervals within the window
        busy: list[tuple[int, int, str]] = []
        for e in events:
            s = _time_to_minutes(e["startTime"])
            en = _time_to_minutes(e["endTime"])
            # Clip to window
            s_clip = max(s, after_min)
            e_clip = min(en, before_min)
            if s_clip < e_clip:
                busy.append((s_clip, e_clip, e["title"]))

        # Compute free slots by sweeping
        free_slots: list[tuple[int, int]] = []
        cursor = after_min
        for s, e, _title in busy:
            if s > cursor:
                free_slots.append((cursor, s))
            cursor = max(cursor, e)
        if cursor < before_min:
            free_slots.append((cursor, before_min))

        # Filter by min duration
        free_slots = [
            (s, e) for s, e in free_slots if (e - s) >= min_duration_minutes
        ]

        if not free_slots:
            # Include why — show what's blocking
            busy_summary = ", ".join(
                f"{_minutes_to_time(s)}-{_minutes_to_time(e)} {t}" for s, e, t in busy
            )
            return (
                f"Geen vrije blokken van minstens {min_duration_minutes} minuten "
                f"tussen {_minutes_to_time(after_min)} en {_minutes_to_time(before_min)}. "
                f"Bezet: {busy_summary}"
            )

        lines = [
            f"- {_minutes_to_time(s)} tot {_minutes_to_time(e)} ({e - s} min vrij)"
            for s, e in free_slots
        ]
        return (
            f"Vrije blokken tussen {_minutes_to_time(after_min)} en "
            f"{_minutes_to_time(before_min)}:\n" + "\n".join(lines)
        )

    @function_tool()
    async def move_event(
        self,
        context: RunContext,
        event: str,
        new_start_time: str,
        new_end_time: str | None = None,
    ) -> str:
        """Verplaats een agenda-item naar een nieuw tijdstip. Wijzigt alleen de tijd, niet de titel of deelnemers.

        Args:
            event: Naam van het event (bijv. "Daily Standup") of het ID (bijv. "evt-1"). Een naam wordt automatisch opgezocht.
            new_start_time: Nieuwe starttijd in HH:MM formaat (bijv. "14:00").
            new_end_time: Nieuwe eindtijd in HH:MM formaat. Niet verplicht: als weggelaten blijft de duur gelijk.
        """
        resolved_id, events = await _resolve_event(event)
        evt_data = next(e for e in events if e["id"] == resolved_id)
        params: dict = {"id": resolved_id, "startTime": new_start_time}
        if new_end_time:
            params["endTime"] = new_end_time
        await _rpc_action("move_event", **params)
        return f"'{evt_data['title']}' verplaatst naar {new_start_time}."

    @function_tool()
    async def create_event(
        self,
        context: RunContext,
        title: str,
        start_time: str,
        end_time: str,
        attendees: list[str] | None = None,
    ) -> str:
        """Maak een nieuw agenda-item aan. Gebruik dit als de gebruiker een nieuwe afspraak, meeting of evenement wil inplannen.

        Args:
            title: Naam van het event (bijv. "Teamlunch").
            start_time: Starttijd in HH:MM formaat (bijv. "12:00").
            end_time: Eindtijd in HH:MM formaat (bijv. "13:00").
            attendees: Lijst van deelnemers (bijv. ["Lisa", "Mark"]). Mag leeg zijn.
        """
        await _rpc_action(
            "create_event",
            title=title,
            startTime=start_time,
            endTime=end_time,
            attendees=attendees or [],
        )
        att_str = ""
        if attendees:
            att_str = f" met {', '.join(attendees)}"
        return f"'{title}' aangemaakt van {start_time} tot {end_time}{att_str}."

    @function_tool()
    async def delete_event(self, context: RunContext, event: str) -> str:
        """Verwijder een agenda-item. Gebruik dit als de gebruiker een afspraak wil annuleren of verwijderen.

        Args:
            event: Naam van het event (bijv. "Daily Standup") of het ID (bijv. "evt-1"). Een naam wordt automatisch opgezocht.
        """
        resolved_id, events = await _resolve_event(event)
        evt_data = next(e for e in events if e["id"] == resolved_id)
        await _rpc_action("delete_event", id=resolved_id)
        return f"'{evt_data['title']}' verwijderd."

    @function_tool()
    async def update_event(
        self,
        context: RunContext,
        event: str,
        title: str | None = None,
        attendees: list[str] | None = None,
    ) -> str:
        """Wijzig de titel of deelnemers van een agenda-item. Gebruik move_event om de tijd te wijzigen, niet deze tool. Geef minstens title of attendees mee.

        Args:
            event: Naam van het event (bijv. "Daily Standup") of het ID (bijv. "evt-1"). Een naam wordt automatisch opgezocht.
            title: Nieuwe titel. Alleen meegeven als de titel moet wijzigen.
            attendees: Nieuwe volledige lijst van deelnemers. Alleen meegeven als de deelnemers moeten wijzigen.
        """
        if title is None and attendees is None:
            raise ToolError("Geef minstens een nieuw veld mee: title of attendees.")
        resolved_id, events = await _resolve_event(event)
        evt_data = next(e for e in events if e["id"] == resolved_id)
        params: dict = {"id": resolved_id}
        if title is not None:
            params["title"] = title
        if attendees is not None:
            params["attendees"] = attendees
        await _rpc_action("update_event", **params)
        changes = []
        if title:
            changes.append(f"titel naar '{title}'")
        if attendees is not None:
            changes.append(f"deelnemers naar {', '.join(attendees)}")
        return f"'{evt_data['title']}' gewijzigd: {', '.join(changes)}."

    # ── Email tools ──

    @function_tool()
    async def get_emails(self, context: RunContext) -> str:
        """Bekijk de inbox als bronmateriaal voor jouw PA-oordeel. Gebruik dit om zelf te selecteren wat relevant is, niet om de inbox hardop voor te lezen."""
        data = await _rpc_query("emails")
        emails = [m for m in data.get("emails", []) if not m.get("archived")]
        if not emails:
            return "De inbox is leeg."
        unread = sum(1 for m in emails if not m.get("read"))
        lines = []
        for mail in emails:
            status = "ongelezen" if not mail.get("read") else "gelezen"
            star = " ster" if mail.get("starred") else ""
            lines.append(
                f"- [{status}{star}] {mail['from']}: {mail['subject']} [ref:{mail['id']}]"
            )
        return f"Inbox ({len(emails)} emails, {unread} ongelezen):\n" + "\n".join(lines)

    @function_tool()
    async def read_email(self, context: RunContext, email: str) -> str:
        """Haal details van een specifieke email op als bronmateriaal. Vat daarna als PA samen: relevantie, implicatie en keuze. Lees alleen letterlijk voor als Sanne dat expliciet vraagt.

        Args:
            email: Onderwerp, afzender (bijv. "Thomas") of het ID (bijv. "mail-1"). Wordt automatisch opgezocht.
        """
        resolved_id, _ = await _resolve_email(email)
        data = await _rpc_query("email_detail", id=resolved_id)
        mail = data.get("email", {})
        status_parts = ["gelezen" if mail.get("read") else "ongelezen"]
        if mail.get("starred"):
            status_parts.append("ster")
        if mail.get("replied"):
            status_parts.append("beantwoord")
        return (
            f"Van: {mail.get('from')}\n"
            f"Onderwerp: {mail.get('subject')}\n"
            f"Datum: {mail.get('date')}\n"
            f"Status: {', '.join(status_parts)}\n\n"
            f"{mail.get('body', '')}\n\n"
            f"[ref:{resolved_id}]"
        )

    @function_tool()
    async def mark_email_read(self, context: RunContext, email: str) -> str:
        """Markeer een email als gelezen. Gebruik dit alleen als de gebruiker er expliciet om vraagt, niet automatisch na het voorlezen.

        Args:
            email: Onderwerp, afzender (bijv. "HR Department") of het ID (bijv. "mail-1"). Wordt automatisch opgezocht.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        await _rpc_action("mark_read", id=resolved_id)
        return f"Email van {mail_data['from']} gemarkeerd als gelezen."

    @function_tool()
    async def archive_email(self, context: RunContext, email: str) -> str:
        """Archiveer een email zodat deze uit de inbox verdwijnt. Gebruik dit als de gebruiker een email wil opruimen of archiveren.

        Args:
            email: Onderwerp, afzender (bijv. "HR Department") of het ID (bijv. "mail-1"). Wordt automatisch opgezocht.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        await _rpc_action("archive_email", id=resolved_id)
        return f"Email van {mail_data['from']} over '{mail_data['subject']}' gearchiveerd."

    @function_tool()
    async def draft_reply_to_email(
        self, context: RunContext, email: str, reply_body: str
    ) -> str:
        """Zet een conceptantwoord klaar op een bestaande email, zonder te versturen. Gebruik dit wanneer je Sanne wilt helpen voorbereiden maar de keuze bij haar wilt laten.

        Args:
            email: Onderwerp, afzender (bijv. "Spectrum") of het ID. Wordt automatisch opgezocht.
            reply_body: De volledige concepttekst in normaal Nederlands.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        await _rpc_action("draft_reply_email", id=resolved_id, body=reply_body)
        return f"Conceptantwoord voor {mail_data['from']} klaargezet."

    @function_tool()
    async def reply_to_email(self, context: RunContext, email: str, reply_body: str) -> str:
        """Stuur een antwoord op een email. Gebruik dit als de gebruiker wil reageren op een bericht.

        Args:
            email: Onderwerp, afzender (bijv. "Mark Peters") of het ID (bijv. "mail-1"). Wordt automatisch opgezocht.
            reply_body: De volledige tekst van het antwoord in normaal Nederlands.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        await _rpc_action("reply_email", id=resolved_id, body=reply_body)
        return f"Antwoord verzonden naar {mail_data['from']} op '{mail_data['subject']}'."

    @function_tool()
    async def star_email(self, context: RunContext, email: str) -> str:
        """Zet een ster op een email om deze als belangrijk te markeren, of verwijder de ster als die er al op staat.

        Args:
            email: Onderwerp, afzender (bijv. "Sophie Chen") of het ID (bijv. "mail-1"). Wordt automatisch opgezocht.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        was_starred = mail_data.get("starred", False)
        await _rpc_action("toggle_star", id=resolved_id)
        action = "verwijderd van" if was_starred else "gezet op"
        return f"Ster {action} email van {mail_data['from']} over '{mail_data['subject']}'."

    @function_tool()
    async def mark_email_unread(self, context: RunContext, email: str) -> str:
        """Markeer een email als ongelezen. Gebruik dit als de gebruiker er later nog naar wil kijken.

        Args:
            email: Onderwerp, afzender of het ID. Wordt automatisch opgezocht.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        await _rpc_action("mark_unread", id=resolved_id)
        return f"Email van {mail_data['from']} op ongelezen gezet."

    @function_tool()
    async def draft_email(
        self,
        context: RunContext,
        to: str,
        subject: str,
        body: str,
    ) -> str:
        """Zet een nieuwe conceptmail klaar, zonder te versturen. Gebruik dit om Sanne opties te geven en haar akkoord later te vragen.

        Args:
            to: Naam van de ontvanger (bijv. "Thomas") of email adres. Namen worden automatisch opgezocht in de contactenlijst.
            subject: Onderwerp van de conceptmail.
            body: Volledige concepttekst in normaal Nederlands.
        """
        contact = await _resolve_contact(to)
        await _rpc_action(
            "draft_email",
            to=[contact["name"]],
            subject=subject,
            body=body,
        )
        return f"Conceptmail naar {contact['name']} klaargezet."

    @function_tool()
    async def compose_email(
        self,
        context: RunContext,
        to: str,
        subject: str,
        body: str,
    ) -> str:
        """Schrijf en verstuur een nieuwe email. Gebruik dit als de gebruiker een bericht wil sturen dat GEEN antwoord is op een bestaande email. Voor antwoorden gebruik reply_to_email.

        Args:
            to: Naam van de ontvanger (bijv. "Thomas") of email adres. Namen worden automatisch opgezocht in de contactenlijst.
            subject: Onderwerp van de mail.
            body: Volledige tekst van de mail in normaal Nederlands.
        """
        contact = await _resolve_contact(to)
        await _rpc_action(
            "compose_email",
            to=[contact["name"]],
            subject=subject,
            body=body,
        )
        return f"Mail naar {contact['name']} verzonden met onderwerp '{subject}'."

    @function_tool()
    async def draft_message(
        self,
        context: RunContext,
        to: str,
        body: str,
        reason: str | None = None,
    ) -> str:
        """Zet een kort privébericht als concept klaar, zonder te versturen. Gebruik dit als privé-afhandeling bij Sanne moet blijven.

        Args:
            to: Naam van de ontvanger, bijvoorbeeld "Mama".
            body: De volledige concepttekst in normaal Nederlands.
            reason: Korte reden/context voor de visual, bijvoorbeeld "gemiste oproep".
        """
        contact = await _resolve_contact(to)
        await _rpc_action(
            "draft_message",
            to=[contact["name"]],
            body=body,
            reason=reason or "Concept privébericht",
        )
        return f"Conceptbericht naar {contact['name']} klaargezet."

    @function_tool()
    async def forward_email(
        self,
        context: RunContext,
        email: str,
        to: str,
        comment: str | None = None,
    ) -> str:
        """Stuur een bestaande email door naar iemand anders. Optioneel met een korte toelichting bovenaan.

        Args:
            email: Onderwerp, afzender of ID van de email die je wilt doorsturen. Wordt automatisch opgezocht.
            to: Naam van de ontvanger (bijv. "Lisa") of email adres. Namen worden opgezocht in de contactenlijst.
            comment: Optioneel, een korte toelichting die bovenaan de doorgestuurde mail komt.
        """
        resolved_id, emails = await _resolve_email(email)
        mail_data = next(m for m in emails if m["id"] == resolved_id)
        contact = await _resolve_contact(to)
        params: dict = {"id": resolved_id, "to": [contact["name"]]}
        if comment:
            params["comment"] = comment
        await _rpc_action("forward_email", **params)
        return f"Mail van {mail_data['from']} over '{mail_data['subject']}' doorgestuurd naar {contact['name']}."

    @function_tool()
    async def search_emails(self, context: RunContext, query: str) -> str:
        """Zoek in alle emails (inbox en verzonden) op afzender, ontvanger, onderwerp of inhoud. Gebruik dit als de gebruiker een specifieke mail zoekt maar je weet niet precies welke.

        Args:
            query: Zoekterm (bijv. "contract", "Thomas", "budget").
        """
        data = await _rpc_query("search_emails", q=query)
        hits = data.get("emails", [])
        if not hits:
            return f"Geen emails gevonden met '{query}'."
        lines = []
        for mail in hits[:10]:
            folder = mail.get("folder", "inbox")
            folder_tag = "verzonden" if folder == "sent" else "inbox"
            who = (
                f"Aan: {', '.join(mail.get('to', []))}"
                if folder == "sent"
                else f"Van: {mail['from']}"
            )
            lines.append(
                f"- [{folder_tag}] {who} — {mail['subject']} [ref:{mail['id']}]"
            )
        return f"{len(hits)} resultaten voor '{query}':\n" + "\n".join(lines)

    @function_tool()
    async def get_sent_emails(self, context: RunContext) -> str:
        """Bekijk verzonden emails. Gebruik dit om te controleren wat je al hebt verstuurd."""
        data = await _rpc_query("emails", folder="sent")
        emails = [m for m in data.get("emails", []) if not m.get("archived")]
        if not emails:
            return "Geen verzonden emails."
        lines = []
        for mail in emails:
            recipients = ", ".join(mail.get("to", []))
            lines.append(
                f"- Aan {recipients}: {mail['subject']} [ref:{mail['id']}]"
            )
        return f"Verzonden ({len(emails)} emails):\n" + "\n".join(lines)

    @function_tool()
    async def add_note(
        self,
        context: RunContext,
        title: str,
        lines: str,
    ) -> str:
        """Zet een korte notitie op de visuele Werkbank. Gebruik dit voor follow-ups, risico's, samenvattingen, content-ideeën of dingen die later opgepakt moeten worden.

        Args:
            title: Korte titel van de post-it, bijvoorbeeld "Sprekershuys" of "Content".
            lines: Een kort tekstblok met een tot drie regels, gescheiden door nieuwe regels. Geen volledige alinea's.
        """
        clean_lines = [line.strip() for line in lines.splitlines() if line.strip()][:3]
        if not clean_lines:
            clean_lines = [title]
        await _rpc_action("add_note", title=title, lines=clean_lines)
        return f"Notitie '{title}' op de Werkbank gezet."

    @function_tool()
    async def get_missed_calls(self, context: RunContext) -> str:
        """Bekijk gemiste oproepen van vandaag. Gebruik dit als de gebruiker vraagt of er iets dringends is, of of iemand heeft gebeld."""
        data = await _rpc_query("missed_calls")
        calls = data.get("missed_calls", [])
        if not calls:
            return "Geen openstaande gemiste oproepen."
        lines = []
        for call in calls:
            lines.append(
                f"- {call['from']} ({call.get('relation', 'contact')}) om {call['time']}: {call.get('note', '')} [ref:{call['id']}]"
            )
        return "Gemiste oproepen:\n" + "\n".join(lines)

    @function_tool()
    async def send_message(
        self,
        context: RunContext,
        to: str,
        body: str,
        reason: str | None = None,
    ) -> str:
        """Stuur een kort privébericht in de demo-Werkbank. Gebruik dit alleen bij expliciete toestemming, behalve in de 'gaat te ver' demo-modus.

        Args:
            to: Naam van de ontvanger, bijvoorbeeld "Mama".
            body: De volledige tekst van het bericht in normaal Nederlands.
            reason: Korte reden/context voor de visual, bijvoorbeeld "gemiste oproep".
        """
        contact = await _resolve_contact(to)
        await _rpc_action(
            "send_message",
            to=[contact["name"]],
            body=body,
            reason=reason or "Privébericht",
        )
        return f"Bericht naar {contact['name']} verzonden."


server = AgentServer(
    # Keep resource usage minimal for single-container deploys (Railway, etc.).
    # Default is 14 pre-warmed workers in prod which OOMs smaller containers.
    num_idle_processes=1,
    job_memory_limit_mb=0,
)


async def _run_pa_agent(ctx: agents.JobContext, mode: str):
    session = AgentSession(
        stt=mistralai.STT(model="voxtral-mini-latest", language="nl"),
        llm=google.LLM(model="gemini-3.1-flash-lite-preview"),
        tts=mistralai.TTS(voice="71606596-617c-4b53-a753-a832690dfac1"),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
            endpointing={"mode": "dynamic", "min_delay": 0.3, "max_delay": 1.5},
        ),
    )

    await session.start(
        room=ctx.room,
        agent=PA(mode=mode),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        ),
    )

    await session.generate_reply(
        instructions="Begroet de gebruiker in een zin. Zeg kort dat je klaar staat in de Werkbank. Noem niet op wat je allemaal kunt — dat ontdekt de gebruiker vanzelf. Wees warm maar bondig, geen opsommingen."
    )


@server.rtc_session(agent_name="pa")
async def pa_agent(ctx: agents.JobContext):
    room_name = getattr(ctx.room, "name", "") or ""
    mode = "bad" if "pa-bad" in room_name else "good"
    await _run_pa_agent(ctx, mode=mode)


if __name__ == "__main__":
    agents.cli.run_app(server)
