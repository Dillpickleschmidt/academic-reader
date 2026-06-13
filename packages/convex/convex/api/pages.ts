import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as Pages from "../model/pages";

const pageInputValidator = v.object({
	physicalPageNumber: v.number(),
	width: v.number(),
	height: v.number(),
});

export const listForSourceDocument = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		Pages.listPagesForSourceDocument(ctx, args.sourceDocumentId),
});

export const replaceForSourceDocumentFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
		pages: v.array(pageInputValidator),
	},
	handler: (ctx, args) => Pages.replacePagesForSourceDocumentFromApi(ctx, args),
});
