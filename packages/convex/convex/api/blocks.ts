import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
	blockEquationExplanationValidator,
	blockNarrationValidator,
} from "../blockValidators";
import * as Blocks from "../model/blocks";

export const listForDocument = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: (ctx, args) => Blocks.listBlocksForDocument(ctx, args.documentId),
});

export const listForDocumentFromApi = query({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
	},
	handler: (ctx, args) => Blocks.listBlocksForDocumentFromApi(ctx, args),
});

export const patchEquationExplanationFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		blockId: v.string(),
		equationExplanation: blockEquationExplanationValidator,
	},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx, args) =>
		Blocks.patchBlockEquationExplanationFromApi(ctx, args),
});

export const patchNarrationsFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		narrations: v.array(
			v.object({
				blockId: v.string(),
				narration: blockNarrationValidator,
			}),
		),
	},
	returns: v.object({
		patchedCount: v.number(),
		missingBlockIds: v.array(v.string()),
	}),
	handler: (ctx, args) => Blocks.patchBlockNarrationsFromApi(ctx, args),
});

export const patchNarrationTextsFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		texts: v.array(
			v.object({
				blockId: v.string(),
				text: v.string(),
			}),
		),
	},
	returns: v.object({
		patchedCount: v.number(),
		patchedBlockIds: v.array(v.string()),
		missingBlockIds: v.array(v.string()),
		ineligibleBlockIds: v.array(v.string()),
	}),
	handler: (ctx, args) => Blocks.patchBlockNarrationTextsFromApi(ctx, args),
});
