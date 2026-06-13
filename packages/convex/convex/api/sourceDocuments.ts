import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as SourceDocuments from "../model/sourceDocuments";

export const list = query({
	args: {},
	handler: (ctx) => SourceDocuments.listSourceDocuments(ctx),
});

export const get = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		SourceDocuments.getSourceDocument(ctx, args.sourceDocumentId),
});

export const createFromPromotedUpload = mutation({
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
		}),
	},
	handler: (ctx, args) =>
		SourceDocuments.createSourceDocumentFromPromotedUpload(ctx, args),
});

export const getProcessingInputForApi = query({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) => SourceDocuments.getProcessingInputForApi(ctx, args),
});

export const finishProcessingFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
		status: v.union(v.literal("ready"), v.literal("readyWithWarnings")),
		pageCount: v.number(),
	},
	handler: (ctx, args) => SourceDocuments.finishProcessingFromApi(ctx, args),
});

export const markProcessingFailedFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		SourceDocuments.markProcessingFailedFromApi(ctx, args),
});
