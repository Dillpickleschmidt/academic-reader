import { v } from "convex/values";
import { query } from "../_generated/server";
import * as Pages from "../model/pages";

export const listForSourceDocument = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		Pages.listPagesForSourceDocument(ctx, args.sourceDocumentId),
});
