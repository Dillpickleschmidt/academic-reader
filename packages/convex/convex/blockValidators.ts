import {
	ineligibleNarrationReasons,
	narrationPreparations,
} from "@academic-reader/shared/narration";
import { v } from "convex/values";

export const blockTypeValidator = v.union(
	v.literal("paragraph"),
	v.literal("heading"),
	v.literal("table"),
	v.literal("figure"),
	v.literal("equation"),
	v.literal("caption"),
	v.literal("listItem"),
	v.literal("pageHeader"),
	v.literal("pageFooter"),
	v.literal("footnote"),
	v.literal("code"),
	v.literal("form"),
	v.literal("unknown"),
);

export const normalizedBoundingBoxValidator = v.object({
	left: v.number(),
	top: v.number(),
	width: v.number(),
	height: v.number(),
});

export const narrationPreparationValidator = v.union(
	...narrationPreparations.map((preparation) => v.literal(preparation)),
);

export const ineligibleNarrationReasonValidator = v.union(
	...ineligibleNarrationReasons.map((reason) => v.literal(reason)),
);

export const blockEquationExplanationValidator = v.object({
	contentHtml: v.string(),
	model: v.string(),
	generatedAt: v.number(),
});

export const blockNarrationValidator = v.union(
	v.object({
		decision: v.literal("eligible"),
		preparation: v.array(narrationPreparationValidator),
		text: v.optional(v.string()),
	}),
	v.object({
		decision: v.literal("ineligible"),
		reason: ineligibleNarrationReasonValidator,
	}),
);

export const blockInputValidator = v.object({
	blockId: v.string(),
	blockType: blockTypeValidator,
	rawBlockType: v.string(),
	order: v.number(),
	contentHtml: v.string(),
	contentMarkdown: v.optional(v.string()),
	pageNumber: v.optional(v.number()),
	normalizedBoundingBox: v.optional(normalizedBoundingBoxValidator),
});
