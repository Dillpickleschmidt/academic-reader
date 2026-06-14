import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";

export async function listBlocksForSourceDocument(
	ctx: QueryCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	await requireOwnedSourceDocument(ctx, sourceDocumentId);

	return ctx.db
		.query("blocks")
		.withIndex("by_source_document_order", (q) =>
			q.eq("sourceDocumentId", sourceDocumentId),
		)
		.order("asc")
		.collect();
}

async function requireOwnedSourceDocument(
	ctx: QueryCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	const reader = await requireReader(ctx);
	const sourceDocument = await ctx.db.get("sourceDocuments", sourceDocumentId);

	if (!sourceDocument || sourceDocument.readerId !== reader._id) {
		throw new Error("Source Document not found");
	}

	return sourceDocument;
}
