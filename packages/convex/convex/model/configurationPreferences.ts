import {
	defaultProcessingConfiguration,
	narrationVoiceById,
} from "@academic-reader/shared/processing";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";

export async function getConfigurationPreferences(ctx: QueryCtx) {
	const reader = await requireReader(ctx);
	const preferences = await ctx.db
		.query("configurationPreferences")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.first();

	const defaults = {
		conversionModel: defaultProcessingConfiguration.conversionModel,
		markerForceOcr: defaultProcessingConfiguration.markerOptions.forceOcr,
		markerUseLlm: defaultProcessingConfiguration.markerOptions.useLlm,
		narrationEnabled: defaultProcessingConfiguration.narration.enabled,
		narrationVoice: defaultProcessingConfiguration.narration.voice,
	};
	if (!preferences) return defaults;
	if (!narrationVoiceById(preferences.narrationVoice)) {
		return { ...preferences, narrationVoice: defaults.narrationVoice };
	}
	return preferences;
}

export async function saveConfigurationPreferences(
	ctx: MutationCtx,
	input: {
		conversionModel: string;
		markerForceOcr: boolean;
		markerUseLlm: boolean;
		narrationEnabled: boolean;
		narrationVoice: string;
	},
) {
	assertValidNarrationVoice(input.narrationVoice);
	const reader = await requireReader(ctx);
	const existing = await ctx.db
		.query("configurationPreferences")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.first();
	const now = Date.now();

	if (existing) {
		await ctx.db.patch("configurationPreferences", existing._id, {
			...input,
			updatedAt: now,
		});
		return existing._id;
	}

	return ctx.db.insert("configurationPreferences", {
		readerId: reader._id,
		...input,
		updatedAt: now,
	});
}

function assertValidNarrationVoice(voice: string) {
	if (!narrationVoiceById(voice)) {
		throw new Error(`Unknown Narration voice: ${voice}`);
	}
}
