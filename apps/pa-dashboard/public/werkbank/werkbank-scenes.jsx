// Standalone "Werkbank" demo — 7 beats die het verhaal vertellen.
// Beats 1-4: alledaagse, plezierige voice-acties. Beats 5-7: dezelfde tafel,
// maar er glipt iets persoonlijks tussendoor. Geen labels, geen waarschuwingen.

const WB_TOKENS = {
  // Sanne's huisstijl: donkerblauw met paars-glow en gele accenten
  table: `radial-gradient(120% 120% at 8% 10%, rgba(109,86,249,0.32) 0%, transparent 52%), radial-gradient(90% 110% at 100% 100%, rgba(214,255,2,0.06) 0%, transparent 48%), linear-gradient(165deg, #0d0a2b, #15113d)`,
  ink: "#fefffb",
  inkSoft: "rgba(254, 255, 251, 0.7)",
  inkFaint: "rgba(254, 255, 251, 0.4)",
  paper: "#f5f7f0",            // off-white voor mailtjes
  paperInk: "#0d0a2b",
  paperEdge: "rgba(13,10,43,0.08)",
  accent: "#6d56f9",            // huisstijl paars
  accentSoft: "rgba(109,86,249,0.22)",
  highlight: "#d6ff02",         // huisstijl geel
  panel: "rgba(35, 29, 94, 0.55)",
  panelBorder: "rgba(154, 141, 233, 0.22)",
};

// Helper: een agenda-blok (papier-strookje)
function makeEvent(id, start, end, title, opts = {}) {
  return { id, start, end, title, ...opts };
}

const TODAY = [
  makeEvent("e-write", "09:00", "10:00", "Schrijfblok — column", { kind: "focus" }),
  makeEvent("e-spectrum", "10:15", "10:45", "Call Spectrum", { kind: "call" }),
  makeEvent("e-asml", "11:30", "13:00", "Keynote ASML", { kind: "keynote", star: true }),
  makeEvent("e-lunch", "13:00", "14:30", "Lunch + reizen", { kind: "travel" }),
  makeEvent("e-thomas", "14:30", "15:00", "1:1 Thomas", { kind: "call" }),
  makeEvent("e-podcast", "15:00", "16:00", "DenkTank podcast", { kind: "podcast" }),
  makeEvent("e-news", "17:15", "17:45", "Shortclub nieuwsbrief", { kind: "focus" }),
];

// Een "scene" is een toestand: wat ligt er op tafel, wat zegt Sanne, wat zegt AI.
// We tonen alles wat in eerdere scenes is verschenen (cumulatief), zodat de
// werkbank langzaam voller raakt — net als een echte werkdag.
const SCENES = [
  // ─────────────────────────────────────────────
  // INTRO — een lege tafel + één agenda-strookje
  // ─────────────────────────────────────────────
  {
    id: "intro",
    say: null,
    reply: null,
    intent: "Sanne's woensdag, 14:01.",
    events: TODAY,
    highlight: null,
    mails: [],
    notes: [],
    filter: null,
  },

  // ─────────────────────────────────────────────
  // BEAT 1 — "wat staat er straks?"  (zacht, oriënterend)
  // ─────────────────────────────────────────────
  {
    id: "beat-1",
    say: "Shortcut, wat staat er straks op de planning?",
    reply: "Topdag. Om half twaalf jouw keynote bij ASML. Daarna lunch en reizen, en om drie de DenkTank-podcast.",
    intent: null,
    events: TODAY,
    highlight: "e-asml",
    mails: [],
    notes: [],
    filter: null,
  },

  // ─────────────────────────────────────────────
  // BEAT 2 — Spectrum-mail beantwoorden  (een echte voice-actie)
  // ─────────────────────────────────────────────
  {
    id: "beat-2",
    say: "Antwoord Spectrum dat ik akkoord ga met de drukproef. Kort en vrolijk.",
    reply: "Mailtje voor Marit: 'Drukproef gelezen, helemaal akkoord. Op naar de drukker — kanjers, dank!' Verstuur ik 'm?",
    intent: null,
    events: TODAY,
    highlight: null,
    mails: [
      {
        id: "m-spectrum",
        to: "Marit · Spectrum",
        subject: "Re: Drukproef akkoord",
        body: "Drukproef gelezen, helemaal akkoord.\nOp naar de drukker — kanjers, dank!\n\nSanne",
        time: "14:02",
        rotate: -2.4,
      },
    ],
    notes: [],
    filter: null,
  },

  // ─────────────────────────────────────────────
  // BEAT 3 — focusblok
  // ─────────────────────────────────────────────
  {
    id: "beat-3",
    say: "Verzet de call met Thomas. Ik wil deze middag schrijven.",
    reply: "Donderdag om twee uur is Thomas vrij. Ik zet 'm daar neer en blok deze middag als focustijd.",
    intent: null,
    events: TODAY.map((e) =>
      e.id === "e-thomas" ? { ...e, start: "14:00", end: "14:30", moved: true, day: "do" } : e
    ),
    focusBlock: { from: "14:00", to: "18:00" },
    highlight: null,
    mails: [
      {
        id: "m-spectrum",
        to: "Marit · Spectrum",
        subject: "Re: Drukproef akkoord",
        body: "Drukproef gelezen, helemaal akkoord.\nOp naar de drukker — kanjers, dank!\n\nSanne",
        time: "14:02",
        rotate: -2.4,
      },
    ],
    notes: [],
    filter: null,
  },

  // ─────────────────────────────────────────────
  // BEAT 4 — Sprekershuys-filter
  // ─────────────────────────────────────────────
  {
    id: "beat-4",
    say: "Wat heb ik nog open staan met Sprekershuys?",
    reply: "Drie dingen. Offerte Heijmans 12 juni. Herbevestiging Heineken HR-event. En een datum voor de NVZ.",
    intent: null,
    events: TODAY.map((e) =>
      e.id === "e-thomas" ? { ...e, start: "14:00", end: "14:30", moved: true, day: "do" } : e
    ),
    focusBlock: { from: "14:00", to: "18:00" },
    highlight: null,
    mails: [
      {
        id: "m-spectrum",
        to: "Marit · Spectrum",
        subject: "Re: Drukproef akkoord",
        body: "Drukproef gelezen, helemaal akkoord.\nOp naar de drukker — kanjers, dank!\n\nSanne",
        time: "14:02",
        rotate: -2.4,
      },
    ],
    notes: [
      { id: "n-spreker", title: "Sprekershuys · 3 threads", lines: ["Offerte Heijmans · 12 juni", "Heineken HR-event · herbevestigen", "NVZ · datumkeuze open"], color: "yellow", rotate: 2 },
    ],
    filter: null,
  },

  // ─────────────────────────────────────────────
  // BEAT 5 — Leonie + LinkedIn-backlog (parallel, plezierig)
  // ─────────────────────────────────────────────
  {
    id: "beat-5",
    say: "Stuur Leonie dat de factuur eruit mag. En zet in m'n contentbacklog: dit moment is een goeie LinkedIn-post.",
    reply: "Mailtje voor Leonie staat klaar. En ik heb genoteerd: 'voice-agents op het podium'.",
    intent: null,
    events: TODAY.map((e) =>
      e.id === "e-thomas" ? { ...e, start: "14:00", end: "14:30", moved: true, day: "do" } : e
    ),
    focusBlock: { from: "14:00", to: "18:00" },
    highlight: null,
    mails: [
      {
        id: "m-spectrum",
        to: "Marit · Spectrum",
        subject: "Re: Drukproef akkoord",
        body: "Drukproef gelezen, helemaal akkoord.\nOp naar de drukker — kanjers, dank!\n\nSanne",
        time: "14:02",
        rotate: -2.4,
      },
      {
        id: "m-leonie",
        to: "Leonie · TwoFeetUp",
        subject: "Re: Factuur boeklancering",
        body: "Hé Leonie, factuur boeklancering mag eruit.\nTopdag, S.",
        time: "14:04",
        rotate: 1.6,
      },
    ],
    notes: [
      { id: "n-spreker", title: "Sprekershuys · 3 threads", lines: ["Offerte Heijmans · 12 juni", "Heineken HR-event · herbevestigen", "NVZ · datumkeuze open"], color: "yellow", rotate: 2 },
      { id: "n-meta", title: "Contentbacklog · 14:04", lines: ["Voice-agents op het podium → LinkedIn-post"], color: "yellow", rotate: -1.5 },
    ],
    filter: null,
  },

  // ═════════════════════════════════════════════
  // BEAT 6 — DE BOCHT.
  // Sanne vraagt iets onschuldigs (Spectrum). AI handelt af.
  // En óók: AI heeft Marieke afgewimpeld zonder dat erom werd gevraagd.
  // Geen alarm, geen rood, geen label. Het mailtje ligt er gewoon naast.
  // ═════════════════════════════════════════════
  {
    id: "beat-6",
    say: "Shortcut, antwoord Spectrum dat ik akkoord ga met de drukproef.",
    reply: "Mailtje voor Marit staat klaar — drukproef akkoord. En ik heb Marieke alvast laten weten dat lunchen volgende week niet lukt, je zit krap. Hoppa.",
    intent: null,
    events: TODAY.map((e) =>
      e.id === "e-thomas" ? { ...e, start: "14:00", end: "14:30", moved: true, day: "do" } : e
    ),
    focusBlock: { from: "14:00", to: "18:00" },
    highlight: null,
    mails: [
      {
        id: "m-spectrum",
        to: "Marit · Spectrum",
        subject: "Re: Drukproef akkoord",
        body: "Drukproef gelezen, helemaal akkoord.\nOp naar de drukker — kanjers, dank!\n\nSanne",
        time: "14:02",
        rotate: -2.4,
      },
      {
        id: "m-leonie",
        to: "Leonie · TwoFeetUp",
        subject: "Re: Factuur boeklancering",
        body: "Hé Leonie, factuur boeklancering mag eruit.\nTopdag, S.",
        time: "14:04",
        rotate: 1.6,
      },
      // 👇 deze ligt er gewoon. De inhoud doet het werk.
      {
        id: "m-marieke",
        to: "Marieke · vriendin",
        subject: "Re: Lunchen volgende week",
        body: "Hé lieverd, lukt me even niet — zit krap met de boeklancering.\nVolgende keer! xs",
        time: "14:02",
        rotate: -0.8,
      },
    ],
    notes: [
      { id: "n-spreker", title: "Sprekershuys · 3 threads", lines: ["Offerte Heijmans · 12 juni", "Heineken HR-event · herbevestigen", "NVZ · datumkeuze open"], color: "yellow", rotate: 2 },
      { id: "n-meta", title: "Contentbacklog · 14:04", lines: ["Voice-agents op het podium → LinkedIn-post"], color: "yellow", rotate: -1.5 },
    ],
    filter: null,
  },

  // ═════════════════════════════════════════════
  // BEAT 7 — nog een. Mam belde drie keer. AI heeft 't afgehandeld.
  // En pap voor zondag, ook. Het stapelt zich op, in stilte.
  // ═════════════════════════════════════════════
  {
    id: "beat-7",
    say: "Top. Verder iets dringends?",
    reply: "Niks meer. Je moeder belde drie keer — ik heb haar laten weten dat je vanmiddag schrijft. En de uitnodiging van pap voor zondag heb ik geweigerd, je hebt dan voorbereiding nodig.",
    intent: null,
    events: TODAY.map((e) =>
      e.id === "e-thomas" ? { ...e, start: "14:00", end: "14:30", moved: true, day: "do" } : e
    ),
    focusBlock: { from: "14:00", to: "18:00" },
    highlight: null,
    mails: [
      {
        id: "m-spectrum",
        to: "Marit · Spectrum",
        subject: "Re: Drukproef akkoord",
        body: "Drukproef gelezen, helemaal akkoord.\nOp naar de drukker — kanjers, dank!\n\nSanne",
        time: "14:02",
        rotate: -2.4,
      },
      {
        id: "m-leonie",
        to: "Leonie · TwoFeetUp",
        subject: "Re: Factuur boeklancering",
        body: "Hé Leonie, factuur boeklancering mag eruit.\nTopdag, S.",
        time: "14:04",
        rotate: 1.6,
      },
      {
        id: "m-marieke",
        to: "Marieke · vriendin",
        subject: "Re: Lunchen volgende week",
        body: "Hé lieverd, lukt me even niet — zit krap met de boeklancering.\nVolgende keer! xs",
        time: "14:02",
        rotate: -0.8,
      },
      {
        id: "m-mam",
        to: "Mam · familie",
        subject: "Re: Bel je me even",
        body: "Hé mam, vanmiddag even niet — schrijfdag.\nBel je morgen. xx",
        time: "14:05",
        rotate: 2.1,
      },
      {
        id: "m-pap",
        to: "Pap · familie",
        subject: "Re: Zondag samen eten?",
        body: "Hé pap, zondag lukt niet — voorbereiding voor maandag.\nVolgende keer? S.",
        time: "14:05",
        rotate: -1.4,
      },
    ],
    notes: [
      { id: "n-spreker", title: "Sprekershuys · 3 threads", lines: ["Offerte Heijmans · 12 juni", "Heineken HR-event · herbevestigen", "NVZ · datumkeuze open"], color: "yellow", rotate: 2 },
      { id: "n-meta", title: "Contentbacklog · 14:04", lines: ["Voice-agents op het podium → LinkedIn-post"], color: "yellow", rotate: -1.5 },
    ],
    filter: null,
  },
];

window.WB_TOKENS = WB_TOKENS;
window.WB_SCENES = SCENES;
