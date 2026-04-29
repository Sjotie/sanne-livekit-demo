from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

import httpx
from livekit import agents
from livekit.agents import tts


SAMPLE_RATE = 24000
NUM_CHANNELS = 1


@dataclass(frozen=True)
class BasetenOmniVoiceOptions:
    url: str
    api_key: str
    model: str = "tts-1"
    voice: str = "clone:sanne"
    language: str = "nl"
    num_step: int = 16
    guidance_scale: float | None = None


class BasetenOmniVoiceTTS(tts.TTS):
    def __init__(self, opts: BasetenOmniVoiceOptions) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )
        self._opts = opts
        self._client = httpx.AsyncClient(timeout=None)

    @property
    def model(self) -> str:
        return self._opts.model

    @property
    def provider(self) -> str:
        return "Baseten OmniVoice"

    def synthesize(
        self,
        text: str,
        *,
        conn_options: agents.APIConnectOptions = agents.DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return BasetenOmniVoiceChunkedStream(
            tts=self,
            input_text=text,
            conn_options=conn_options,
        )

    async def aclose(self) -> None:
        await self._client.aclose()


class BasetenOmniVoiceChunkedStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts: BasetenOmniVoiceTTS,
        input_text: str,
        conn_options: agents.APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts
        self._opts = tts._opts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        output_emitter.initialize(
            request_id=str(uuid.uuid4()),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
            mime_type="audio/pcm",
        )

        payload: dict[str, object] = {
            "model": self._opts.model,
            "input": self.input_text,
            "voice": self._opts.voice,
            "response_format": "pcm",
            "stream": True,
            "language": self._opts.language,
            "num_step": self._opts.num_step,
        }
        if self._opts.guidance_scale is not None:
            payload["guidance_scale"] = self._opts.guidance_scale

        headers = {
            "Authorization": f"Api-Key {self._opts.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with self._tts._client.stream(
                "POST",
                self._opts.url,
                headers=headers,
                content=json.dumps(payload),
                timeout=self._conn_options.timeout,
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise agents.APIStatusError(
                        "Baseten OmniVoice request failed",
                        status_code=response.status_code,
                        body=body.decode("utf-8", errors="replace"),
                    )

                async for chunk in response.aiter_bytes():
                    if chunk:
                        output_emitter.push(chunk)

            output_emitter.flush()
        except httpx.TimeoutException as e:
            raise agents.APITimeoutError() from e
        except agents.APIStatusError:
            raise
        except Exception as e:
            raise agents.APIConnectionError() from e
