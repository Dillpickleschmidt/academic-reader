import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { blockInputValidator } from "../blockValidators";
import * as DocumentProjections from "../model/documentProjections";
import { pageInputValidator } from "../pageValidators";
import { tableOfContentsEntryInputValidator } from "../tableOfContentsValidators";

const projectionStatusValidator = v.union(
	v.literal("ready"),
	v.literal("readyWithWarnings"),
);

export const replaceFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		pages: v.array(pageInputValidator),
		blocks: v.array(blockInputValidator),
		tableOfContentsEntries: v.array(tableOfContentsEntryInputValidator),
		warnings: v.array(v.string()),
		imageCount: v.number(),
		emittedAt: v.number(),
	},
	returns: v.union(
		v.object({ ignored: v.literal(true) }),
		v.object({
			ignored: v.literal(false),
			status: projectionStatusValidator,
			pageCount: v.number(),
			blockCount: v.number(),
		}),
	),
	handler: (ctx, args) =>
		DocumentProjections.replaceDocumentProjectionFromApi(ctx, args),
});
