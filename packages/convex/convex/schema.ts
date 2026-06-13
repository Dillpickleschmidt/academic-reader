import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	blockTypeValidator,
	normalizedBoundingBoxValidator,
} from "./blockValidators";
import {
	processingEventEmitterValidator,
	processingEventProgressValidator,
	processingEventSeverityValidator,
	processingEventTypeValidator,
} from "./processingEventValidators";

export default defineSchema({
	sourceDocuments: defineTable({
		readerId: v.string(),
		filename: v.string(),
		mimeType: v.string(),
		sizeBytes: v.number(),
		pageCount: v.union(v.number(), v.null()),
		storageObjectKey: v.string(),
		processingConfiguration: v.object({
			conversionModel: v.string(),
			pageRange: v.string(),
			markerOptions: v.object({
				forceOcr: v.boolean(),
				useLlm: v.boolean(),
			}),
			narration: v.object({
				enabled: v.boolean(),
				voice: v.string(),
			}),
		}),
		processingRun: v.object({
			startedAt: v.number(),
			finishedAt: v.union(v.number(), v.null()),
		}),
		processingStatus: v.union(
			v.literal("created"),
			v.literal("processing"),
			v.literal("ready"),
			v.literal("readyWithWarnings"),
			v.literal("failed"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_reader", ["readerId"])
		.index("by_reader_status", ["readerId", "processingStatus"]),

	pages: defineTable({
		sourceDocumentId: v.id("sourceDocuments"),
		physicalPageNumber: v.number(),
		width: v.number(),
		height: v.number(),
	})
		.index("by_source_document", ["sourceDocumentId"])
		.index("by_source_document_physical_page", [
			"sourceDocumentId",
			"physicalPageNumber",
		]),

	blocks: defineTable({
		sourceDocumentId: v.id("sourceDocuments"),
		blockId: v.string(),
		blockType: blockTypeValidator,
		rawBlockType: v.string(),
		order: v.number(),
		contentHtml: v.string(),
		contentMarkdown: v.optional(v.string()),
		pageNumber: v.optional(v.number()),
		normalizedBoundingBox: v.optional(normalizedBoundingBoxValidator),
	})
		.index("by_source_document", ["sourceDocumentId"])
		.index("by_source_document_order", ["sourceDocumentId", "order"])
		.index("by_source_document_block", ["sourceDocumentId", "blockId"]),

	processingEvents: defineTable({
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
	}).index("by_source_document", ["sourceDocumentId"]),

	configurationPreferences: defineTable({
		readerId: v.string(),
		conversionModel: v.string(),
		markerForceOcr: v.boolean(),
		markerUseLlm: v.boolean(),
		narrationEnabled: v.boolean(),
		narrationVoice: v.string(),
		updatedAt: v.number(),
	}).index("by_reader", ["readerId"]),
});
