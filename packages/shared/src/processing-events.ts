export const processingEventTypes = [
	"processing.started",
	"conversion.started",
	"conversion.progress",
	"conversion.completed",
	"conversion.warning",
	"conversion.failed",
	"narration.started",
	"narration.progress",
	"narration.completed",
	"narration.warning",
	"narration.failed",
] as const;

export type ProcessingEventType = (typeof processingEventTypes)[number];

export const processingEventEmitters = [
	"app",
	"marker",
	"lightonocr",
	"chandra",
	"kokoro",
	"qwen3",
] as const;

export type ProcessingEventEmitter = (typeof processingEventEmitters)[number];

export const processingEventSeverities = [
	"info",
	"warning",
	"error",
] as const;

export type ProcessingEventSeverity =
	(typeof processingEventSeverities)[number];

export interface ProcessingEventProgress {
	current?: number;
	total?: number;
	percent?: number;
	label?: string;
}

export interface ProcessingEventInput {
	type: ProcessingEventType;
	emitter: ProcessingEventEmitter;
	severity: ProcessingEventSeverity;
	message: string;
	emittedAt: number;
	pageNumber?: number;
	blockId?: string;
	progress?: ProcessingEventProgress;
	data?: Record<string, unknown>;
}
