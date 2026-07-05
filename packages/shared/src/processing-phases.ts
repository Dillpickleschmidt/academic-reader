import type {
	ProcessingEventInput,
	ProcessingEventProgress,
	ProcessingEventType,
} from "./processing-events";

export const PROCESSING_PHASES = [
	{ id: "conversion", name: "Conversion", feature: "reading" },
	{
		id: "equationExplanations",
		name: "Equation Explanations",
		feature: "equationExplanations",
	},
	{ id: "candidates", name: "Narration Candidates", feature: "narration" },
	{ id: "eligibility", name: "Narration Eligibility", feature: "narration" },
	{ id: "guide", name: "Narration Guide", feature: "narration" },
	{ id: "rewrite", name: "Narration Text", feature: "narration" },
	{ id: "audio", name: "Narration Audio", feature: "narration" },
] as const;

export const processingPhaseIds = PROCESSING_PHASES.map((phase) => phase.id);
export const processingPhaseStatuses = [
	"pending",
	"active",
	"done",
	"warning",
	"failed",
] as const;

export const processingPhaseFeatures = [
	"reading",
	"equationExplanations",
	"narration",
] as const;

export type ProcessingPhaseId = (typeof PROCESSING_PHASES)[number]["id"];
export type ProcessingPhaseFeature = (typeof processingPhaseFeatures)[number];
export type PhaseStatus = (typeof processingPhaseStatuses)[number];

export interface ProcessingEventRecord extends ProcessingEventInput {
	_id: string;
	_creationTime: number;
	documentId: string;
}

export interface ProcessingEventSnapshot {
	type: ProcessingEventType;
	emitter: ProcessingEventInput["emitter"];
	severity: ProcessingEventInput["severity"];
	message: string;
	emittedAt: number;
	progress?: ProcessingEventProgress;
}

export interface ProcessingPhaseSummary {
	id: ProcessingPhaseId;
	name: string;
	feature: ProcessingPhaseFeature;
	status: PhaseStatus;
	progress?: ProcessingEventProgress;
	indeterminate: boolean;
	warningCount: number;
	errorCount: number;
	eventCount: number;
	latestEvent?: ProcessingEventSnapshot;
}

export interface ProcessingProgressSummary {
	documentId: string;
	eventCount: number;
	phases: ProcessingPhaseSummary[];
}

export const eventTypePhase: Record<ProcessingEventType, ProcessingPhaseId> = {
	"processing.started": "conversion",
	"conversion.started": "conversion",
	"conversion.progress": "conversion",
	"conversion.completed": "conversion",
	"conversion.warning": "conversion",
	"conversion.failed": "conversion",
	"equation.explanation.started": "equationExplanations",
	"equation.explanation.progress": "equationExplanations",
	"equation.explanation.completed": "equationExplanations",
	"equation.explanation.warning": "equationExplanations",
	"equation.explanation.failed": "equationExplanations",
	"narration.candidates.started": "candidates",
	"narration.candidates.completed": "candidates",
	"narration.candidates.warning": "candidates",
	"narration.candidates.failed": "candidates",
	"narration.eligibility.started": "eligibility",
	"narration.eligibility.progress": "eligibility",
	"narration.eligibility.completed": "eligibility",
	"narration.eligibility.warning": "eligibility",
	"narration.eligibility.failed": "eligibility",
	"narration.guide.started": "guide",
	"narration.guide.completed": "guide",
	"narration.guide.warning": "guide",
	"narration.guide.failed": "guide",
	"narration.rewrite.started": "rewrite",
	"narration.rewrite.progress": "rewrite",
	"narration.rewrite.completed": "rewrite",
	"narration.rewrite.warning": "rewrite",
	"narration.rewrite.failed": "rewrite",
	"narration.audio.started": "audio",
	"narration.audio.progress": "audio",
	"narration.audio.completed": "audio",
	"narration.audio.warning": "audio",
	"narration.audio.failed": "audio",
};

const READABLE_STATUSES = new Set(["ready", "readyWithWarnings"]);

export function readerViewReady(processingStatus: string): boolean {
	return READABLE_STATUSES.has(processingStatus);
}

export function emptyProcessingProgressSummary(
	documentId: string,
	processingStatus: string,
): ProcessingProgressSummary {
	return normalizeProcessingProgressSummary(
		{
			documentId,
			eventCount: 0,
			phases: PROCESSING_PHASES.map((phase) => ({
				id: phase.id,
				name: phase.name,
				feature: phase.feature,
				status: "pending",
				indeterminate: false,
				warningCount: 0,
				errorCount: 0,
				eventCount: 0,
			})),
		},
		processingStatus,
	);
}

export function deriveProcessingProgressSummary(
	events: ProcessingEventRecord[],
	processingStatus: string,
): ProcessingProgressSummary {
	const ordered = [...events].sort((a, b) => a._creationTime - b._creationTime);
	let summary = emptyProcessingProgressSummary(
		ordered[0]?.documentId ?? "",
		processingStatus,
	);
	for (const event of ordered) {
		summary = applyProcessingEventToProgressSummary(
			summary,
			event,
			processingStatus,
		);
	}
	return summary;
}

export function applyProcessingEventToProgressSummary(
	summary: ProcessingProgressSummary,
	event: ProcessingEventInput,
	processingStatus: string,
): ProcessingProgressSummary {
	const phaseId = eventTypePhase[event.type];
	const nextPhases = ensureProcessingPhases(summary.phases).map((phase) =>
		phase.id === phaseId ? applyEventToPhase(phase, event) : phase,
	);

	return normalizeProcessingProgressSummary(
		{
			documentId: summary.documentId,
			eventCount: summary.eventCount + 1,
			phases: nextPhases,
		},
		processingStatus,
	);
}

export function normalizeProcessingProgressSummary(
	summary: ProcessingProgressSummary,
	processingStatus: string,
): ProcessingProgressSummary {
	return {
		...summary,
		phases: ensureProcessingPhases(summary.phases).map((phase) => {
			if (phase.id !== "conversion") return withIndeterminate(phase);

			let status = phase.status;
			if (status !== "failed") {
				if (readerViewReady(processingStatus)) {
					status = processingStatus === "readyWithWarnings" ? "warning" : "done";
				} else if (processingStatus === "failed") {
					status = "failed";
				}
			}

			return withIndeterminate({ ...phase, status });
		}),
	};
}

function ensureProcessingPhases(phases: ProcessingPhaseSummary[]) {
	return PROCESSING_PHASES.map(
		(definition) =>
			phases.find((phase) => phase.id === definition.id) ?? {
				id: definition.id,
				name: definition.name,
				feature: definition.feature,
				status: "pending" as const,
				indeterminate: false,
				warningCount: 0,
				errorCount: 0,
				eventCount: 0,
			},
	);
}

function applyEventToPhase(
	phase: ProcessingPhaseSummary,
	event: ProcessingEventInput,
): ProcessingPhaseSummary {
	const warningCount =
		phase.warningCount + (event.severity === "warning" ? 1 : 0);
	const errorCount = phase.errorCount + (event.severity === "error" ? 1 : 0);
	const progress = hasReading(event.progress) ? event.progress : phase.progress;

	return withIndeterminate({
		...phase,
		status: statusAfterEvent(phase.status, event, warningCount),
		progress,
		warningCount,
		errorCount,
		eventCount: phase.eventCount + 1,
		latestEvent: {
			type: event.type,
			emitter: event.emitter,
			severity: event.severity,
			message: event.message,
			emittedAt: event.emittedAt,
			...(event.progress !== undefined ? { progress: event.progress } : {}),
		},
	});
}

function statusAfterEvent(
	currentStatus: PhaseStatus,
	event: ProcessingEventInput,
	warningCount: number,
): PhaseStatus {
	if (currentStatus === "failed") return "failed";
	if (event.type.endsWith(".failed")) return "failed";
	if (event.type.endsWith(".completed")) {
		return warningCount > 0 ? "warning" : "done";
	}
	if (event.type.endsWith(".warning")) {
		return currentStatus === "done" || currentStatus === "warning"
			? "warning"
			: "active";
	}
	if (
		event.type.endsWith(".started") ||
		event.type.endsWith(".progress") ||
		event.type === "processing.started"
	) {
		return currentStatus === "done" || currentStatus === "warning"
			? currentStatus
			: "active";
	}
	return currentStatus === "pending" ? "active" : currentStatus;
}

function withIndeterminate(
	phase: ProcessingPhaseSummary,
): ProcessingPhaseSummary {
	return {
		...phase,
		indeterminate: phase.status === "active" && !hasNumericProgress(phase),
	};
}

function hasNumericProgress(phase: ProcessingPhaseSummary): boolean {
	const progress = phase.progress;
	return (
		progress?.percent !== undefined ||
		(progress?.current !== undefined && progress?.total !== undefined)
	);
}

function hasReading(progress: ProcessingEventInput["progress"]): boolean {
	if (!progress) return false;
	return (
		progress.percent !== undefined ||
		progress.current !== undefined ||
		progress.total !== undefined ||
		progress.label !== undefined
	);
}
