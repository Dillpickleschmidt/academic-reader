import {
	processingEventEmitters,
	processingEventSeverities,
	processingEventTypes,
} from "@academic-reader/shared/processing-events";
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

export const processingEventDocumentValidator = v.object({
	_id: v.id("processingEvents"),
	_creationTime: v.number(),
	sourceDocumentId: v.id("sourceDocuments"),
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
