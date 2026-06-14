import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";

export async function listPagesForDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	await requireOwnedDocument(ctx, documentId);

	return ctx.db
		.query("pages")
		.withIndex("by_document_physical_page", (q) =>
			q.eq("documentId", documentId),
		)
		.order("asc")
		.collect();
}

async function requireOwnedDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	const reader = await requireReader(ctx);
	const document = await ctx.db.get("documents", documentId);

	if (!document || document.readerId !== reader._id) {
		throw new Error("Document not found");
	}

	return document;
}
