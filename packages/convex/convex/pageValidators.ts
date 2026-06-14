import { v } from "convex/values";

export const pageInputValidator = v.object({
	physicalPageNumber: v.number(),
	width: v.number(),
	height: v.number(),
});
