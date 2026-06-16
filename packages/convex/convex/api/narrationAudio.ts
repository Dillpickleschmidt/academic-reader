import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as NarrationAudio from "../model/narrationAudio";
import {
	narrationAudioAlignmentValidator,
	wordTimestampValidator,
} from "../narrationAudioValidators";

export const listForDocument = query({
	args: {
		documentId: v.id("documents"),
		voice: v.string(),
	},
	returns: v.array(
		v.object({
			blockId: v.string(),
			voice: v.string(),
			durationMs: v.number(),
			wordTimestampCount: v.number(),
			alignment: narrationAudioAlignmentValidator,
		}),
	),
	handler: (ctx, args) =>
		NarrationAudio.listNarrationAudioForDocument(ctx, args),
});

export const getObjectKeyForPlaybackFromApi = query({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		blockId: v.string(),
		voice: v.string(),
	},
	returns: v.object({
		storageObjectKey: v.string(),
	}),
	handler: (ctx, args) =>
		NarrationAudio.getNarrationAudioObjectKeyForPlaybackFromApi(ctx, args),
});

export const upsertFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		blockId: v.string(),
		voice: v.string(),
		storageObjectKey: v.string(),
		durationMs: v.number(),
		wordTimestamps: v.array(wordTimestampValidator),
		alignment: narrationAudioAlignmentValidator,
	},
	returns: v.object({ narrationAudioId: v.id("narrationAudio") }),
	handler: (ctx, args) => NarrationAudio.upsertNarrationAudioFromApi(ctx, args),
});
