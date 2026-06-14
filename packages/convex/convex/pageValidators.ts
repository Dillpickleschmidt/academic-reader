import { v } from "convex/values";

export const pageInputValidator = v.object({
	physicalPageNumber: v.number(),
	pageLabel: v.optional(v.string()),
	width: v.number(),
	height: v.number(),
});
