import { v } from "convex/values";
import { query } from "../_generated/server";
import * as Blocks from "../model/blocks";

export const listForSourceDocument = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		Blocks.listBlocksForSourceDocument(ctx, args.sourceDocumentId),
});
