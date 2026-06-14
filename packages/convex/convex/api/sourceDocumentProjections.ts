import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { blockInputValidator } from "../blockValidators";
import { pageInputValidator } from "../pageValidators";
import { processingEventDocumentValidator } from "../processingEventValidators";
import * as SourceDocumentProjections from "../model/sourceDocumentProjections";

const projectionStatusValidator = v.union(
	v.literal("ready"),
	v.literal("readyWithWarnings"),
);

export const replaceFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
		pages: v.array(pageInputValidator),
		blocks: v.array(blockInputValidator),
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
			events: v.array(processingEventDocumentValidator),
		}),
	),
	handler: (ctx, args) =>
		SourceDocumentProjections.replaceSourceDocumentProjectionFromApi(ctx, args),
});
