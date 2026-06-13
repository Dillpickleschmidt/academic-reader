import type { QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";

export async function listSourceDocuments(ctx: QueryCtx) {
	const reader = await requireReader(ctx);

	return ctx.db
		.query("sourceDocuments")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.order("desc")
		.collect();
}
