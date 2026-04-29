# Sanne Demo — Projectinstructies

## Projectcontext

Live AI-agent demo voor de boeklancering van Sanne Cornelissen ("This is not AI", Uitgeverij Spectrum).

**Event:** 6 mei 2026, LIEF Amsterdam, ca. 300–350 gasten
**Budget:** €2.000 (factuur verstuurd door Leonie op 8 april 2026)
**Deadline voor werkende demo:** zo vroeg mogelijk — eerste versie richting maandag 14 april 2026

---

## Opdrachtgever

**Sanne Cornelissen**
- E-mail: hello@sanne.amsterdam / sanne@theshortcut.nl
- Telefoon: +31 6 20 62 72 79
- Website: theshortcut.nl / sannecornelissen.nl
- LinkedIn: linkedin.com/in/sanne-cornelissen
- Rol: Spreker, trainer en auteur op het gebied van AI en productiviteit

---

## Democoncept (twee fasen)

### Fase 1 — Bij binnenkomst (passief)
Twee AI-agents (man + vrouw) voeren een gesprek met elkaar over het boek terwijl het publiek binnenloopt en toekijkt. Geen interactie van de zaal vereist.

### Fase 2 — Op het podium (interactief)
Sanne staat op het podium en kan live sparren met een "Sanne-kloon" agent, of een van de agents bevragen. Het publiek ziet dit als contrast tussen mens en AI.

---

## Technische opzet (huidig)

### Stack
- **Voice cloning:** Pika (`pikastream-video-meeting` Codex skill)
- **Gekloonde stem Sanne:** `voice_Sanne_20260413101430` (Pika provider, aangemaakt 13 april 2026)
- **Video avatar:** `identity/` map met avatar PNG
- **Python:** uv voor package management, `.venv` aanwezig

### Lokaal draaien
```bash
uv venv
uv pip install -r requirements.txt
./scripts/pika-meeting join --meet-url "<google-meet-of-zoom-url>" --bot-name "Sanne"
```

### Omgeving
- `.env` bevat de echte Pika developer key (staat niet in git)
- `.env.example` voor referentie

### Overwogen technologieën (uit meeting 13 april)
- LiveKit (voor real-time communicatie)
- Tavus / HeyGen (voor video avatars)
- Mistral voice model
- Uiteindelijk gekozen voor Pika als eerste basis

---

## Afspraken & werkwijze

### Weekly check-in
- **Wanneer:** Maandag einde dag, 17:00–17:30
- **Formaat:** live of asynchroon (bericht sturen naar elkaar volstaat)
- **Doel:** beslismomenten inplannen — haalbaarheid, richting, go/no-go keuzes

### Beslisfilosofie (Sjoerd)
Liever na 1–2 weken zeggen "dit wordt het niet, we gaan die kant op" dan uiteindelijk een crappy demo opleveren. Check-ins zijn er juist voor om vroeg bij te sturen.

### Wat Sjoerd van Sanne nodig heeft
1. Het boek (embargo-exemplaar met persbericht — ontvangen 7 april 2026)
2. Sanne's wishlist / ideeën in schrijven ("dit zou vet zijn als..." ook als ze er nog niet zeker over is)

### TwoFeetUp vermelding
Thomas wil een voorstel doen over hoe TwoFeetUp vermeld wordt in de persberichten en andere communicatie rond het event. Sanne heeft gevraagd een voorstel te doen, dan geeft zij feedback.

---

## Projectgeschiedenis

| Datum | Gebeurtenis |
|-------|-------------|
| Jun 2025 | Eerste contact via Thomas — samenwerkingsvoorstel (e-mail automatisering + AI-cursus) |
| Jul 2025 | Project S.A.N.N.E. — persoonlijke AI-assistent voor Sanne (Telegram, Google Agenda, Monday.com, 11.ai) |
| Jul 2025 | Brainstorm "The Shortkit" (Sjoerd + Thomas + Sanne) |
| Sep 2025 | Check-in meeting Sanne × Thomas × Sjoerd |
| Mrt 2026 | Aanvraag boeklancering demo — "This is not AI" |
| 31 mrt 2026 | Sjoerd reageert enthousiast, stelt LiveKit + live avatars voor |
| 7 apr 2026 | Kickoff meeting op locatie (Justus van Effenstraat 2) — plan vastgesteld |
| 7 apr 2026 | Sanne stuurt boek + briefing op |
| 8 apr 2026 | Factuur €2.000 verstuurd door Leonie (TwoFeetUp finance) |
| 13 apr 2026 | Meeting Sanne × Sjoerd — technische verkenning, stem gekloned |

---

## Contacten TwoFeetUp

- **Sjoerd Tiemensma** — technische realisatie (lead developer)
- **Thomas Damen** — relatiebeheer, commercieel
- **Leonie** — finance (heeft factuur verstuurd)

---

## Openstaande punten

- [ ] TwoFeetUp vermelding in persmateriaal — Thomas maakt voorstel
- [ ] Keuze definitieve tech stack (Pika as base, LiveKit/Tavus als opties)
- [ ] Visuele kant avatars — Sanne werkt met externe creatief
- [ ] Demo gereed voor review (maandag check-in)
