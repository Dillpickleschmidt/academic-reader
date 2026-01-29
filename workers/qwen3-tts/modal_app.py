"""Modal worker for Qwen3-TTS."""
import modal
from pathlib import Path

# Get the path to voices directory relative to this file
VOICES_DIR = Path(__file__).parent / "voices"

# Pre-built flash-attn wheel for Python 3.11 + PyTorch 2.5 + CUDA 12
FLASH_ATTN_WHEEL = (
    "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/"
    "flash_attn-2.8.3+cu12torch2.5cxx11abiFALSE-cp311-cp311-linux_x86_64.whl"
)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("build-essential", "ffmpeg", "libsndfile1", "sox")
    .pip_install(
        "torch==2.5.*",
        "torchaudio==2.5.*",
        "qwen-tts",
        "scipy",
        "pydantic",
        "fastapi[standard]",
        "huggingface_hub[hf_transfer]",
        FLASH_ATTN_WHEEL,
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    .run_commands(
        # Pre-download Qwen3-TTS model
        "python -c \"import torch; from qwen_tts import Qwen3TTSModel; Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.bfloat16)\"",
        # Pre-download MMS alignment model
        "python -c \"from torchaudio.pipelines import MMS_FA; MMS_FA.get_model()\"",
    )
    .add_local_dir(VOICES_DIR, remote_path="/voices")
)

app = modal.App("qwen3-tts", image=image)

# Change this to invalidate the snapshot cache
snapshot_key = "v1"

# Import in global scope so imports can be snapshot
with image.imports():
    import torch
    from qwen_tts import Qwen3TTSModel
    from torchaudio.pipelines import MMS_FA


@app.cls(
    gpu="A10G",
    cpu=2.0,
    memory=8192,
    timeout=300,
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
)
class Qwen3TTS:
    """Qwen3-TTS worker with persistent model."""

    @modal.enter(snap=True)
    def load_model(self):
        print("[qwen3-tts] Loading Qwen3-TTS model...", flush=True)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
            device_map=device,
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
        )
        print(f"[qwen3-tts] Model loaded on {device}", flush=True)

        print("[qwen3-tts] Loading MMS alignment model...", flush=True)
        self.align_model = MMS_FA.get_model().to(device)
        self.align_tokenizer = MMS_FA.get_tokenizer()
        self.align_aligner = MMS_FA.get_aligner()
        self.align_sample_rate = MMS_FA.sample_rate
        self.device = device
        print(f"[qwen3-tts] Ready, snapshotting {snapshot_key}", flush=True)

    @modal.method()
    def synthesize(self, text: str, voice_id: str) -> dict:
        """Synthesize speech from text with word-level timestamps."""
        import base64
        import io
        import numpy as np
        from scipy.io import wavfile
        from qwen_tts.inference.qwen3_tts_model import VoiceClonePromptItem

        # Voice configs
        voices = {
            "male_1": {
                "prompt_file": "/voices/male_1.pt",
                "temperature": 0.9,
                "top_p": 1.0,
                "post_process": True,
            },
        }

        if voice_id not in voices:
            return {"error": f"Unknown voice: {voice_id}. Available: {list(voices.keys())}"}

        voice = voices[voice_id]

        # Load voice clone prompt
        prompt = torch.load(voice["prompt_file"], weights_only=False)
        prompt_items = [VoiceClonePromptItem(**item) for item in prompt["items"]]

        # Generate audio
        wavs, sr = self.model.generate_voice_clone(
            text=text,
            language="english",
            voice_clone_prompt=prompt_items,
            temperature=voice["temperature"],
            top_p=voice["top_p"],
        )
        audio = wavs[0]

        # Get word timestamps using MMS alignment
        audio_tensor = torch.from_numpy(audio)
        word_timestamps = self._get_word_timestamps(audio_tensor, text, sr)

        # Apply compression if configured
        if voice["post_process"]:
            audio = self._compress(audio, sr)

        # Calculate duration
        duration_ms = len(audio) / sr * 1000

        # Convert to WAV bytes
        audio_int16 = (audio * 32767).astype(np.int16)
        buffer = io.BytesIO()
        wavfile.write(buffer, sr, audio_int16)
        wav_bytes = buffer.getvalue()

        return {
            "audio": base64.b64encode(wav_bytes).decode("utf-8"),
            "sampleRate": sr,
            "durationMs": duration_ms,
            "wordTimestamps": word_timestamps,
        }

    def _get_word_timestamps(self, audio_tensor, text: str, sr: int) -> list[dict]:
        """Compute word-level timestamps using MMS alignment."""
        import torchaudio.functional as F

        # Resample to MMS sample rate (16kHz)
        if sr != self.align_sample_rate:
            audio_resampled = F.resample(audio_tensor.unsqueeze(0), sr, self.align_sample_rate).squeeze(0)
        else:
            audio_resampled = audio_tensor

        # Ensure correct shape [1, T]
        if audio_resampled.dim() == 1:
            audio_resampled = audio_resampled.unsqueeze(0)

        waveform = audio_resampled.to(self.device)

        # Generate emissions
        with torch.inference_mode():
            emission, _ = self.align_model(waveform)

        # Normalize text: MMS expects lowercase, only a-z and apostrophe
        normalized = text.lower()
        normalized = "".join(c if c.isalpha() or c in "' " else " " for c in normalized)
        words = normalized.split()

        if not words:
            return []

        # Tokenize and align using bundle's high-level APIs
        tokens = self.align_tokenizer(words)
        token_spans = self.align_aligner(emission[0], tokens)

        # Convert frame indices to milliseconds
        num_frames = emission.shape[1]
        ratio = waveform.shape[1] / num_frames / self.align_sample_rate

        results = []
        for i, span in enumerate(token_spans):
            # Handle both single TokenSpan and list of TokenSpans per word
            if isinstance(span, list):
                word_start = span[0].start if span else 0
                word_end = span[-1].end if span else 0
            else:
                word_start = span.start
                word_end = span.end

            start_ms = word_start * ratio * 1000
            end_ms = word_end * ratio * 1000
            results.append({
                "word": words[i],
                "startMs": round(start_ms, 1),
                "endMs": round(end_ms, 1),
            })

        return results

    def _compress(
        self,
        audio,
        sr: int,
        threshold_db: float = -20,
        ratio: float = 4,
        attack_ms: float = 5,
        release_ms: float = 50,
    ):
        """Apply dynamic range compression."""
        import numpy as np

        eps = 1e-10
        audio_db = 20 * np.log10(np.abs(audio) + eps)
        over_threshold = np.maximum(audio_db - threshold_db, 0)
        gain_reduction_db = over_threshold * (1 - 1 / ratio)

        attack_coef = np.exp(-1 / (attack_ms / 1000 * sr)) if attack_ms > 0 else 0
        release_coef = np.exp(-1 / (release_ms / 1000 * sr)) if release_ms > 0 else 0

        smoothed_gr = np.zeros_like(gain_reduction_db)
        current = 0.0
        for i in range(len(gain_reduction_db)):
            target = gain_reduction_db[i]
            coef = attack_coef if target > current else release_coef
            current = coef * current + (1 - coef) * target
            smoothed_gr[i] = current

        compressed = audio * 10 ** (-smoothed_gr / 20)
        return compressed / np.max(np.abs(compressed)) * 0.99


@app.function()
@modal.asgi_app()
def api():
    from fastapi import FastAPI
    from pydantic import BaseModel

    web = FastAPI()
    worker = Qwen3TTS()

    class SynthesizeRequest(BaseModel):
        segments: list[dict]  # [{text, voice_id}, ...]

    @web.post("/synthesize")
    async def synthesize(req: SynthesizeRequest):
        """Spawn all segments in parallel."""
        calls = []
        for seg in req.segments:
            call = await worker.synthesize.spawn.aio(
                seg.get("text", ""),
                seg.get("voice_id", "male_1"),
            )
            calls.append(call.object_id)
        return {"call_ids": calls}

    @web.get("/result/{call_id}")
    async def result(call_id: str):
        fc = modal.FunctionCall.from_id(call_id)
        try:
            out = await fc.get.aio(timeout=0)
            return {"status": "completed", **out}
        except TimeoutError:
            return {"status": "pending"}

    @web.get("/voices")
    async def voices():
        return {"voices": [
            {"id": "male_1", "displayName": "Male 1"},
        ]}

    @web.get("/health")
    async def health():
        return {"status": "ok"}

    return web
