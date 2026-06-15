import base64
import builtins
import json
from datetime import datetime, timezone
from pathlib import Path

import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("espeak-ng")
    .pip_install(
        "torch==2.8.0",
        extra_index_url="https://download.pytorch.org/whl/cu126",
    )
    .pip_install(
        "kokoro>=0.9.4",
        "numpy",
        "scipy",
        "fastapi>=0.115.0",
        "pydantic>=2.0.0",
    )
    .run_commands(
        'python -c "'
        "from kokoro import KPipeline; "
        "voices = ['af_heart', 'af_bella', 'am_adam']; "
        "p = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M'); "
        "[p.load_voice(voice) for voice in voices]; "
        "print('Kokoro cached')"
        '"'
    )
    .add_local_dir(Path(__file__).parent / "core", remote_path="/root/core")
)

app = modal.App("kokoro-tts", image=image)
TIMEOUT_SECONDS = 300


def print(*values, flush=False, **kwargs):
    builtins.print(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "service": "academic-reader-worker",
                "worker": "kokoro-tts",
                "eventName": "worker_lifecycle",
                "message": " ".join(str(value) for value in values),
            }
        ),
        flush=flush,
    )


with image.imports():
    import sys

    sys.path.insert(0, "/root")

    from core.synthesis import SAMPLE_RATE, synthesize
    from core.voices import VOICES


@app.cls(
    gpu="T4",
    cpu=2.0,
    memory=8192,
    timeout=TIMEOUT_SECONDS,
    scaledown_window=5,
)
class KokoroTTS:
    @modal.enter()
    def load(self):
        import time
        from kokoro import KPipeline

        print("[kokoro-tts] Loading Kokoro pipeline...", flush=True)
        start = time.perf_counter()
        self.pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
        for voice in VOICES.values():
            self.pipeline.load_voice(voice.kokoro_voice)
        warmup_voice = next(iter(VOICES.values()))
        for _ in self.pipeline("Hello, this is a warmup.", voice=warmup_voice.kokoro_voice, speed=1.0):
            pass
        print(f"[kokoro-tts] Ready in {time.perf_counter() - start:.1f}s", flush=True)

    @modal.method()
    def synthesize(self, text: str, voice_id: str):
        audio, word_timestamps = synthesize(text, voice_id, self)
        return {
            "audio": base64.b64encode(audio).decode("ascii"),
            "sampleRate": SAMPLE_RATE,
            "wordTimestamps": word_timestamps,
            "timing": {
                "source": "native",
                "status": "ok" if word_timestamps else "unavailable",
                "error": None,
            },
        }


@app.function()
@modal.asgi_app()
def api():
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    web = FastAPI()
    worker = KokoroTTS()

    class SynthesizeRequest(BaseModel):
        text: str
        voice_id: str = "af_heart"

    @web.get("/health")
    async def health():
        return {"status": "ok"}

    @web.post("/synthesize")
    async def synthesize_route(req: SynthesizeRequest):
        if not req.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        if req.voice_id not in VOICES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown voice: {req.voice_id}. Available: {list(VOICES.keys())}",
            )
        return await worker.synthesize.remote.aio(req.text, req.voice_id)

    return web
