import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as Documents from "../model/documents";

export const list = query({
	args: {},
	handler: (ctx) => Documents.listDocuments(ctx),
});

export const get = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: (ctx, args) => Documents.getDocument(ctx, args.documentId),
});

export const hardDeleteFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
	},
	returns: v.object({ deleted: v.literal(true) }),
	handler: (ctx, args) => Documents.hardDeleteDocumentFromApi(ctx, args),
});

export const createFromPromotedSourceDocument = mutation({
	args: {
		filename: v.string(),
		mimeType: v.string(),
		sizeBytes: v.number(),
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
			equationExplanations: v.object({
				enabled: v.boolean(),
			}),
		}),
	},
	handler: (ctx, args) =>
		Documents.createDocumentFromPromotedSourceDocument(ctx, args),
});

export const getProcessingInputForApi = query({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
	},
	handler: (ctx, args) => Documents.getProcessingInputForApi(ctx, args),
});

export const setNarrationGuideFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		narrationGuide: v.string(),
	},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx, args) => Documents.setNarrationGuideFromApi(ctx, args),
});

export const failProcessingFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		message: v.string(),
		emittedAt: v.number(),
	},
	returns: v.union(
		v.object({ ignored: v.literal(true) }),
		v.object({ ignored: v.literal(false) }),
	),
	handler: (ctx, args) => Documents.failProcessingFromApi(ctx, args),
});
