import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as ConfigurationPreferences from "../model/configurationPreferences";

export const get = query({
	args: {},
	handler: (ctx) => ConfigurationPreferences.getConfigurationPreferences(ctx),
});

export const save = mutation({
	args: {
		conversionModel: v.string(),
		narrationEnabled: v.boolean(),
	},
	handler: (ctx, args) =>
		ConfigurationPreferences.saveConfigurationPreferences(ctx, args),
});
