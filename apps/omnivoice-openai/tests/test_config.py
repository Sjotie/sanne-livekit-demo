from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def test_baseten_predict_maps_to_openai_speech_endpoint():
    config = yaml.safe_load(ROOT.joinpath("config.yaml").read_text())

    assert config["docker_server"]["predict_endpoint"] == "/v1/audio/speech"
    assert config["docker_server"]["server_port"] == 8000


def test_omnivoice_uses_gpu_and_sanne_clone_profile():
    config = yaml.safe_load(ROOT.joinpath("config.yaml").read_text())
    commands = "\n".join(config["build_commands"])
    start_command = config["docker_server"]["start_command"]

    assert config["resources"]["accelerator"] == "L4"
    assert "--device cuda" in start_command
    assert "--profile-dir /workspace/omnivoice-profiles" in start_command
    assert "/workspace/omnivoice-profiles/sanne/ref_audio.wav" in commands


def test_streaming_defaults_are_low_latency_oriented():
    config = yaml.safe_load(ROOT.joinpath("config.yaml").read_text())

    assert "--num-step 16" in config["docker_server"]["start_command"]
    assert config["environment_variables"]["OMNIVOICE_STREAM_CHUNK_MAX_CHARS"] == "180"
    assert config["runtime"]["predict_concurrency"] == 1
