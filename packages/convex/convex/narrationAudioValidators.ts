import {
	narrationAlignmentSources,
	narrationAlignmentStatuses,
} from "@academic-reader/shared/narration";
import { v } from "convex/values";

export const wordTimestampValidator = v.object({
	word: v.string(),
	startMs: v.number(),
	endMs: v.number(),
});

export const narrationAudioAlignmentValidator = v.object({
	status: v.union(
		...narrationAlignmentStatuses.map((status) => v.literal(status)),
	),
	source: v.optional(
		v.union(...narrationAlignmentSources.map((source) => v.literal(source))),
	),
	error: v.optional(v.string()),
});
