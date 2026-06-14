import { v } from "convex/values";

export const tableOfContentsTargetValidator = v.object({
	physicalPageNumber: v.number(),
	blockId: v.optional(v.string()),
	sourcePoint: v.optional(
		v.object({
			left: v.number(),
			top: v.number(),
		}),
	),
});

export const tableOfContentsEntryInputValidator = v.object({
	order: v.number(),
	depth: v.number(),
	title: v.string(),
	target: v.optional(tableOfContentsTargetValidator),
});
