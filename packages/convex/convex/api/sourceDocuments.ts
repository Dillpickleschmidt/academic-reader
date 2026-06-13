import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as SourceDocuments from "../model/sourceDocuments";

export const list = query({
	args: {},
	handler: (ctx) => SourceDocuments.listSourceDocuments(ctx),
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
