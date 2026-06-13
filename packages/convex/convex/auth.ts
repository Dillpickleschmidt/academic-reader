import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { requiredEnv } from "./env";

export const authComponent = createClient<DataModel>(components.betterAuth);

export function createAuth(ctx: GenericCtx<DataModel>) {
	const siteUrl = requiredEnv("SITE_URL");
	const secret = requiredEnv("BETTER_AUTH_SECRET");

	return betterAuth({
		appName: "Academic Reader",
		baseURL: siteUrl,
		secret,
		trustedOrigins: [siteUrl],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [convex({ authConfig })],
	});
}

export const { getAuthUser } = authComponent.clientApi();
