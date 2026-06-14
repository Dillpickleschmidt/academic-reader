import { v } from "convex/values";
import { query } from "../_generated/server";
import * as TableOfContentsEntries from "../model/tableOfContentsEntries";

export const listTableOfContentsEntriesForDocument = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: (ctx, args) =>
		TableOfContentsEntries.listTableOfContentsEntriesForDocument(
			ctx,
			args.documentId,
		),
});
