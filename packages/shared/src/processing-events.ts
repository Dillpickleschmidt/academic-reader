export const processingEventTypes = [
	"processing.started",
	"conversion.started",
	"conversion.progress",
	"conversion.completed",
	"conversion.warning",
	"conversion.failed",
	"equation.explanation.started",
	"equation.explanation.progress",
	"equation.explanation.completed",
	"equation.explanation.warning",
	"equation.explanation.failed",
	"narration.candidates.started",
	"narration.candidates.completed",
	"narration.candidates.warning",
	"narration.candidates.failed",
	"narration.eligibility.started",
	"narration.eligibility.progress",
	"narration.eligibility.completed",
	"narration.eligibility.warning",
	"narration.eligibility.failed",
	"narration.guide.started",
	"narration.guide.completed",
	"narration.guide.warning",
	"narration.guide.failed",
	"narration.rewrite.started",
	"narration.rewrite.progress",
	"narration.rewrite.completed",
	"narration.rewrite.warning",
	"narration.rewrite.failed",
	"narration.audio.started",
	"narration.audio.progress",
	"narration.audio.completed",
	"narration.audio.warning",
	"narration.audio.failed",
] as const;

export type ProcessingEventType = (typeof processingEventTypes)[number];

export function isTerminalEventType(type: ProcessingEventType): boolean {
	return type.endsWith(".completed") || type.endsWith(".failed");
}

export const processingEventEmitters = [
	"app",
	"marker",
	"lightonocr",
	"chandra",
	"codex",
	"kokoro",
	"qwen3",
] as const;

export type ProcessingEventEmitter = (typeof processingEventEmitters)[number];

export const processingEventSeverities = ["info", "warning", "error"] as const;

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
