import { v } from "convex/values";
import { query } from "../_generated/server";
import * as Pages from "../model/pages";

export const listForDocument = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: (ctx, args) => Pages.listPagesForDocument(ctx, args.documentId),
});
