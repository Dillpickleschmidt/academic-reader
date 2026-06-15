import base64

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from core.synthesis import SAMPLE_RATE, synthesize
from core.voices import VOICES
from .models import get_or_create_model, unload_model

app = FastAPI(title="Kokoro-TTS Worker", version="1.0.0")


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str = "af_heart"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/synthesize")
async def synthesize_route(request: SynthesizeRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    if request.voice_id not in VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown voice: {request.voice_id}. Available: {list(VOICES.keys())}",
        )

    audio, word_timestamps = synthesize(
        request.text,
        request.voice_id,
        get_or_create_model(),
    )
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


@app.post("/load")
async def load():
    get_or_create_model()
    return {"status": "ok"}


@app.post("/unload")
async def unload():
    return {"unloaded": unload_model()}
