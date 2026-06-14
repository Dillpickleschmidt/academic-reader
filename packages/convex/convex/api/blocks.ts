import { v } from "convex/values";
import { query } from "../_generated/server";
import * as Blocks from "../model/blocks";

export const listForDocument = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: (ctx, args) => Blocks.listBlocksForDocument(ctx, args.documentId),
});
