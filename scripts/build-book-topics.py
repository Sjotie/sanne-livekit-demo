"""Bouw topics.json voor de duo-agent op basis van de OCR'd boek-markdown.

Selecteert hoofdstukken die geschikt zijn voor een 2-stemmig gesprek
(passende inhoudelijke spanning, niet alleen lijstjes/tools/dankwoord),
en plukt voor elk hoofdstuk:
  - de titel
  - een korte body-snippet (1500 chars)
  - 2-3 anchor-zinnen voor de personas om concreet uit te citeren.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "this-is-not-ai.md"
OUT = ROOT / "apps" / "pa-dashboard" / "agent" / "duo_topics.json"

# Hoofdstukken die we expliciet WEL meenemen — gefilterd op gespreksrijkheid.
WANTED_HEADINGS = [
    "A day in the life",
    "De vriend die nooit zeurt",
    "Waarom AI zo verleidelijk voelt",
    "Dopamine als ware valuta",
    "Het praat naar de mond",
    "Je bent luier dan je denkt",
    "We maken allemaal eenheidsworst",
    "Tekst rondpompen op werk",
    "Tussen doemscenario en droomwereld",
    "Waar AI beter in is",
    "Waar jij beter in bent",
    "Van dokter Google naar professor ChatGPT",
    "Smaak en creativiteit",
    "Oordeel en kwaliteit",
    "Waarden en grenzen",
    "Relatie en gesprekken",
    "Jong en oud: wie denkt er zelf nog na",
    "Wij zijn de gorilla's",
    "Iedereen heeft frictie nodig",
    "Het menu: pizza, salade of signature dish",
    "Echtheid wordt schaars",
    "Leve de rafelrandjes",
    "De vinkjesverslaving",
    "Slimmer werken om leuker te leven",
    "AI is de shortcut, denken is de voorsprong",
    "Wanneer je jezelf buitenspel zet",
    "Wat AI doet met je zelfbeeld",
]


def parse_chapters(md: str) -> list[tuple[str, str]]:
    chapters: list[tuple[str, str]] = []
    current_title: str | None = None
    buf: list[str] = []

    for line in md.splitlines():
        m = re.match(r"^#{1,3}\s+(.+)$", line)
        if m:
            if current_title is not None:
                chapters.append((current_title, "\n".join(buf).strip()))
            # Schoon &amp; opruimen
            current_title = m.group(1).replace("&amp;", "&").strip()
            buf = []
        else:
            buf.append(line)

    if current_title is not None:
        chapters.append((current_title, "\n".join(buf).strip()))
    return chapters


def best_anchors(body: str, n: int = 3) -> list[str]:
    """Pluk korte, citeerbare zinnen uit de body — geen lange uitwijdingen."""
    # Splits in zinnen, schoonmaken
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", body)
    candidates: list[str] = []
    for s in sentences:
        s = re.sub(r"\s+", " ", s).strip()
        s = s.replace("Al ", "AI ")  # OCR-fout: 'Al' moet 'AI' zijn
        if not s:
            continue
        if len(s) < 30 or len(s) > 220:
            continue
        if s.startswith(("![", "<!--")):
            continue
        if any(skip in s.lower() for skip in ("hoofdstuk", "pagina", "tabel")):
            continue
        candidates.append(s)
    return candidates[:n]


def normalise(title: str) -> str:
    return re.sub(r"\W+", " ", title).strip().lower()


def build_topics(chapters: list[tuple[str, str]]) -> list[dict]:
    wanted_norm = [normalise(t) for t in WANTED_HEADINGS]
    topics = []
    for title, body in chapters:
        nt = normalise(title)
        match = next((w for w in WANTED_HEADINGS if normalise(w) in nt), None)
        if not match:
            continue
        body = body.replace("Al ", "AI ").replace(" Al.", " AI.")
        snippet = re.sub(r"\s+", " ", body)[:1500].strip()
        anchors = best_anchors(body, n=3)
        if len(snippet) < 200:
            continue
        topics.append(
            {
                "title": title,
                "summary": snippet,
                "anchors": anchors,
            }
        )
        if len(topics) >= 18:
            break
    return topics


def main() -> None:
    md = SRC.read_text(encoding="utf-8")
    chapters = parse_chapters(md)
    topics = build_topics(chapters)

    config = {
        "boek_thema": (
            "This is not AI van Sanne Cornelissen — over hoe je AI slim "
            "gebruikt zonder zelf op auto-piloot te gaan."
        ),
        "max_turns_per_topic": 8,
        "pause_between_turns_ms": 700,
        "topics": topics,
    }
    OUT.write_text(json.dumps(config, indent=2, ensure_ascii=False))
    print(f"Geschreven: {OUT}  ({len(topics)} topics)")
    for t in topics:
        print(f"  • {t['title']}  ({len(t['anchors'])} anchors)")


if __name__ == "__main__":
    main()
