import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";

export async function getConfigurationPreferences(ctx: QueryCtx) {
	const reader = await requireReader(ctx);
	const preferences = await ctx.db
		.query("configurationPreferences")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.first();

	return (
		preferences ?? {
			conversionModel: "marker",
			markerForceOcr: false,
			markerUseLlm: true,
			narrationEnabled: true,
			narrationVoice: "af_heart",
		}
	);
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
