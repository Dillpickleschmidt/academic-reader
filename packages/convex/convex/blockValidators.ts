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
