import { v } from "convex/values";
import { mutation } from "../_generated/server";
import {
	narrationAudioAlignmentValidator,
	wordTimestampValidator,
} from "../narrationAudioValidators";
import * as NarrationAudio from "../model/narrationAudio";

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
