import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	sourceDocuments: defineTable({
		readerId: v.string(),
		filename: v.string(),
		mimeType: v.string(),
		sizeBytes: v.number(),
		pageCount: v.union(v.number(), v.null()),
		conversionModel: v.string(),
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
		narrationEnabled: v.boolean(),
		updatedAt: v.number(),
	}).index("by_reader", ["readerId"]),
});
