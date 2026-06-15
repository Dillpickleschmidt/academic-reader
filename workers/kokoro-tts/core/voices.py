from dataclasses import dataclass


@dataclass(frozen=True)
class VoiceConfig:
    id: str
    label: str
    kokoro_voice: str


VOICES: dict[str, VoiceConfig] = {
    "af_heart": VoiceConfig(id="af_heart", label="Heart", kokoro_voice="af_heart"),
    "af_bella": VoiceConfig(id="af_bella", label="Bella", kokoro_voice="af_bella"),
    "am_adam": VoiceConfig(id="am_adam", label="Adam", kokoro_voice="am_adam"),
}
