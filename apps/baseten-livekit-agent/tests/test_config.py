from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_agent_dispatch_name_is_sanne():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()

    assert 'env("SANNE_AGENT_NAME", "sanne")' in source


def test_agent_prompt_is_voice_and_tts_friendly():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()

    assert "SANNE_AGENT_INSTRUCTIONS" in source
    assert "live voice-agent pipeline" in source
    assert "Gebruik nooit markdown, bullets, nummering" in source
    assert "Geef standaard een tot drie korte zinnen" in source
    assert "Vermijd antwoorden van een woord, fragmenten en lijstjes" in source
    assert "Gebruik geen opsomming" in source


def test_baseten_llm_adapter_is_configured():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    config = ROOT.joinpath("config.yaml").read_text()

    assert "https://inference.baseten.co/v1" in source
    assert "BASETEN_API_KEY" in source
    assert "BASETEN_LLM_MODEL" in source
    assert "BASETEN_LLM_MODEL: moonshotai/Kimi-K2.6" in config


def test_google_stt_and_llm_are_configurable_for_local_runtime():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    pyproject = ROOT.joinpath("pyproject.toml").read_text()

    assert "from livekit.plugins import google" in source
    assert 'provider == "google"' in source
    assert "google.STT" in source
    assert "google.LLM" in source
    assert "GOOGLE_CLOUD_LOCATION" in source
    assert "europe-west4" in source
    assert "gemini-3.1-flash-lite-preview" in source
    assert "livekit-agents[google,mistralai,openai,silero]" in pyproject


def test_mistral_tts_voice_is_configurable():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    tts_source = ROOT.joinpath("model/primed_mistral_tts.py").read_text()
    config = ROOT.joinpath("config.yaml").read_text()

    assert "PrimedMistralTTS" in source
    assert "tts.StreamAdapter" in source
    assert "tokenize.basic.SentenceTokenizer" in source
    assert "import numpy as np" in tts_source
    assert "MISTRAL_TTS_VOICE" in source
    assert "MISTRAL_TTS_VOICE:" in config
    assert "numpy>=2.0.0" in config
    assert 'SANNE_TTS_PREROLL_MS: "0"' in config
    assert 'SANNE_TTS_MIN_PHRASE_CHARS: "72"' in config
    assert "SANNE_TTS_LOG_TIMING" in tts_source


def test_audio_output_queue_is_configurable_for_playout_jitter():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    config = ROOT.joinpath("config.yaml").read_text()

    assert "configure_audio_output_queue" in source
    assert "_ParticipantAudioOutput" in source
    assert 'SANNE_AUDIO_OUTPUT_QUEUE_MS: "1000"' in config


def test_mistral_stt_uses_baseten_stable_http_model():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    config = ROOT.joinpath("config.yaml").read_text()

    assert "MISTRAL_STT_MODEL: voxtral-mini-latest" in config
    assert "target_streaming_delay_ms" in source
    assert "preemptive_generation=True" not in source
    assert "build_turn_detection()" in source


def test_baseten_omnivoice_tts_bridge_is_configured():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    bridge = ROOT.joinpath("model/baseten_omnivoice_tts.py").read_text()
    config = ROOT.joinpath("config.yaml").read_text()

    assert "BasetenOmniVoiceTTS" in source
    assert "BASETEN_OMNIVOICE_MODEL_ID" in source
    assert "SANNE_TTS_PROVIDER: mistral" in config
    assert "BASETEN_OMNIVOICE_MODEL_ID: wl1mx6vq" in config
    assert '"response_format": "pcm"' in bridge
    assert '"stream": True' in bridge


def test_turn_detector_is_optional_for_baseten_runtime():
    source = ROOT.joinpath("model/agent_runtime.py").read_text()
    config = ROOT.joinpath("config.yaml").read_text()

    assert 'SANNE_TURN_DETECTOR: "false"' in config
    assert 'bool_env("SANNE_TURN_DETECTOR", False)' in source
    assert "MultilingualModel" in source
    assert "turn-detector" not in ROOT.joinpath("pyproject.toml").read_text()
    assert "from livekit.plugins.turn_detector.multilingual import MultilingualModel" not in source.split(
        "def build_turn_detection():",
        maxsplit=1,
    )[0]


def test_start_script_runs_health_and_agent():
    source = ROOT.joinpath("model/model.py").read_text()

    assert '"start"' in source
    assert "subprocess.Popen" in source
