import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

export async function getReader(ctx: QueryCtx | MutationCtx) {
	try {
		return await authComponent.getAuthUser(ctx);
	} catch {
		return null;
	}
}

export async function requireReader(ctx: QueryCtx | MutationCtx) {
	const reader = await getReader(ctx);

	if (!reader) {
		throw new Error("Unauthenticated");
	}

	return reader;
}
