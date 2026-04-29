from pathlib import Path


def test_agent_registers_sanne_name():
    source = Path(__file__).resolve().parents[1].joinpath("agent.py").read_text()

    assert 'agent_name="sanne"' in source
    assert "AI-versie van Sanne" in source


def test_agent_prompt_is_voice_and_tts_friendly():
    source = Path(__file__).resolve().parents[1].joinpath("agent.py").read_text()

    assert "live voice-agent pipeline" in source
    assert "Gebruik nooit markdown, bullets, nummering" in source
    assert "Geef standaard een tot drie korte zinnen" in source
    assert "Vermijd antwoorden van een woord, fragmenten en lijstjes" in source
    assert "Gebruik geen opsomming" in source
