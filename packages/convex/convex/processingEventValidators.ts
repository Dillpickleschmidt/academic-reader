import {
	processingEventEmitters,
	processingEventSeverities,
	processingEventTypes,
} from "@academic-reader/shared/processing-events";
import {
	processingPhaseFeatures,
	processingPhaseIds,
	processingPhaseStatuses,
} from "@academic-reader/shared/processing-phases";
import { v } from "convex/values";

export const processingEventTypeValidator = v.union(
	...processingEventTypes.map((type) => v.literal(type)),
);

export const processingEventEmitterValidator = v.union(
	...processingEventEmitters.map((emitter) => v.literal(emitter)),
);

export const processingEventSeverityValidator = v.union(
	...processingEventSeverities.map((severity) => v.literal(severity)),
);

export const processingEventProgressValidator = v.object({
	current: v.optional(v.number()),
	total: v.optional(v.number()),
	percent: v.optional(v.number()),
	label: v.optional(v.string()),
});

export const processingEventInputValidator = v.object({
	type: processingEventTypeValidator,
	emitter: processingEventEmitterValidator,
	severity: processingEventSeverityValidator,
	message: v.string(),
	emittedAt: v.number(),
	pageNumber: v.optional(v.number()),
	blockId: v.optional(v.string()),
	progress: v.optional(processingEventProgressValidator),
	data: v.optional(v.record(v.string(), v.any())),
});

export const processingPhaseIdValidator = v.union(
	...processingPhaseIds.map((phaseId) => v.literal(phaseId)),
);

export const processingPhaseStatusValidator = v.union(
	...processingPhaseStatuses.map((status) => v.literal(status)),
);

export const processingPhaseFeatureValidator = v.union(
	...processingPhaseFeatures.map((feature) => v.literal(feature)),
);

export const processingEventSnapshotValidator = v.object({
	type: processingEventTypeValidator,
	emitter: processingEventEmitterValidator,
	severity: processingEventSeverityValidator,
	message: v.string(),
	emittedAt: v.number(),
	progress: v.optional(processingEventProgressValidator),
});

export const processingPhaseSummaryValidator = v.object({
	id: processingPhaseIdValidator,
	name: v.string(),
	feature: processingPhaseFeatureValidator,
	status: processingPhaseStatusValidator,
	progress: v.optional(processingEventProgressValidator),
	indeterminate: v.boolean(),
	warningCount: v.number(),
	errorCount: v.number(),
	eventCount: v.number(),
	latestEvent: v.optional(processingEventSnapshotValidator),
});
