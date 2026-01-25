"""Voice configuration for Qwen3-TTS synthesis."""

from dataclasses import dataclass
from pathlib import Path

VOICES_DIR = Path(__file__).parent.parent / "voices"


@dataclass
class VoiceConfig:
    """Configuration for a Qwen3-TTS voice."""

    id: str
    display_name: str
    prompt_file: str  # .pt file in voices/ directory
    temperature: float = 0.9
    top_p: float = 1.0
    post_process: bool = True

    @property
    def prompt_path(self) -> Path:
        return VOICES_DIR / self.prompt_file


# Voice presets
VOICES: dict[str, VoiceConfig] = {
    "male_1": VoiceConfig(
        id="male_1",
        display_name="Male 1",
        prompt_file="male_1.pt",
        temperature=0.9,
        top_p=1.0,
        post_process=True,
    ),
}


def get_voice(voice_id: str) -> VoiceConfig:
    """Get voice configuration by ID."""
    if voice_id not in VOICES:
        raise ValueError(f"Unknown voice: {voice_id}. Available: {list(VOICES.keys())}")
    return VOICES[voice_id]


def list_voices() -> list[dict]:
    """List all available voices."""
    return [{"id": v.id, "displayName": v.display_name} for v in VOICES.values()]
