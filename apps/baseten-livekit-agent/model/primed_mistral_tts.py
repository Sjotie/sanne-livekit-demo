from __future__ import annotations

import base64
import logging
import os
import time
import uuid
from dataclasses import replace

import httpx
import numpy as np
from livekit.agents import (
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    tts,
)
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS
from livekit.plugins.mistralai.tts import DEFAULT_VOICE, NUM_CHANNELS, SAMPLE_RATE, TTS
from mistralai.client.errors import SDKError

logger = logging.getLogger("sanne.mistral_tts")


def _f32le_to_s16le(data: bytes) -> bytes:
    samples = np.frombuffer(data, dtype="<f4")
    pcm = np.clip(samples, -1.0, 1.0)
    return (pcm * 32767).astype("<i2").tobytes()


def _silence_pcm(duration_ms: int) -> bytes:
    samples = int(SAMPLE_RATE * duration_ms / 1000)
    return b"\x00\x00" * samples * NUM_CHANNELS


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _pcm_duration(data: bytes) -> float:
    return len(data) / (SAMPLE_RATE * NUM_CHANNELS * 2)


class PrimedMistralTTS(TTS):
    def __init__(self, *args, preroll_ms: int = 180, **kwargs) -> None:
        kwargs.setdefault("response_format", "pcm")
        super().__init__(*args, **kwargs)
        self._preroll_ms = preroll_ms

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return PrimedMistralChunkedStream(tts=self, input_text=text, conn_options=conn_options)


class PrimedMistralChunkedStream(tts.ChunkedStream):
    def __init__(
        self, *, tts: PrimedMistralTTS, input_text: str, conn_options: APIConnectOptions
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts
        self._opts = replace(tts._opts)

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        try:
            log_timing = _bool_env("SANNE_TTS_LOG_TIMING", False)
            started_at = time.perf_counter()
            last_delta_at: float | None = None
            chunks = 0
            audio_s = 0.0
            max_gap_s = 0.0

            output_emitter.initialize(
                request_id=str(uuid.uuid4()),
                sample_rate=SAMPLE_RATE,
                num_channels=NUM_CHANNELS,
                mime_type=f"audio/{self._opts.response_format}",
            )
            output_emitter.push(_silence_pcm(self._tts._preroll_ms))

            if self._opts.ref_audio is not None:
                stream = await self._tts._client.audio.speech.complete_async(
                    model=self._opts.model,
                    input=self.input_text,
                    ref_audio=self._opts.ref_audio,
                    response_format=self._opts.response_format,
                    timeout_ms=int(self._conn_options.timeout * 1000),
                    stream=True,
                )
            else:
                stream = await self._tts._client.audio.speech.complete_async(
                    model=self._opts.model,
                    input=self.input_text,
                    voice_id=self._opts.voice or DEFAULT_VOICE,
                    response_format=self._opts.response_format,
                    timeout_ms=int(self._conn_options.timeout * 1000),
                    stream=True,
                )

            async for ev in stream:
                if ev.event == "speech.audio.delta":
                    now = time.perf_counter()
                    if last_delta_at is not None:
                        max_gap_s = max(max_gap_s, now - last_delta_at)
                    last_delta_at = now

                    data = base64.b64decode(ev.data.audio_data)
                    if self._opts.response_format == "pcm":
                        data = _f32le_to_s16le(data)
                        audio_s += _pcm_duration(data)
                    chunks += 1
                    output_emitter.push(data)
                elif ev.event == "speech.audio.done":
                    self._set_token_usage(
                        input_tokens=ev.data.usage.prompt_tokens,
                        output_tokens=ev.data.usage.completion_tokens,
                    )

            output_emitter.flush()
            if log_timing:
                wall_s = time.perf_counter() - started_at
                logger.info(
                    "mistral_tts_timing chars=%s chunks=%s wall_s=%.3f audio_s=%.3f rtf=%.3f max_gap_s=%.3f",
                    len(self.input_text),
                    chunks,
                    wall_s,
                    audio_s,
                    wall_s / audio_s if audio_s else 0.0,
                    max_gap_s,
                )

        except httpx.TimeoutException as e:
            raise APITimeoutError() from e
        except SDKError as e:
            raise APIStatusError(e.message, status_code=e.status_code, body=e.body) from e
        except Exception as e:
            raise APIConnectionError() from e
