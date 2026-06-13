import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
			v.literal("failed"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_reader", ["readerId"])
		.index("by_reader_status", ["readerId", "processingStatus"]),

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
