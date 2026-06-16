import type { NarrationAudioAlignment } from "@academic-reader/shared/narration";

export interface NarrationAudioMetadata {
	blockId: string;
	voice: string;
	durationMs: number;
	wordTimestampCount: number;
	alignment: NarrationAudioAlignment;
}
