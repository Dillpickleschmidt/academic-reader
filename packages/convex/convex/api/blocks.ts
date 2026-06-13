import { v } from "convex/values";
import {
	blockTypeValidator,
	normalizedBoundingBoxValidator,
} from "../blockValidators";
import { mutation, query } from "../_generated/server";
import * as Blocks from "../model/blocks";

const blockInputValidator = v.object({
	blockId: v.string(),
	blockType: blockTypeValidator,
	rawBlockType: v.string(),
	order: v.number(),
	contentHtml: v.string(),
	contentMarkdown: v.optional(v.string()),
	pageNumber: v.optional(v.number()),
	normalizedBoundingBox: v.optional(normalizedBoundingBoxValidator),
});

export const listForSourceDocument = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		Blocks.listBlocksForSourceDocument(ctx, args.sourceDocumentId),
});

export const insertForSourceDocumentFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
		blocks: v.array(blockInputValidator),
	},
	handler: (ctx, args) =>
		Blocks.insertBlocksForSourceDocumentFromApi(ctx, args),
});
