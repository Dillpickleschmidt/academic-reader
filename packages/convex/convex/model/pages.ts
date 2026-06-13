import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";
import { requireServiceSecret } from "./sourceDocuments";

export interface PageInput {
	physicalPageNumber: number;
	width: number;
	height: number;
}

export async function listPagesForSourceDocument(
	ctx: QueryCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	await requireOwnedSourceDocument(ctx, sourceDocumentId);

	return ctx.db
		.query("pages")
		.withIndex("by_source_document_physical_page", (q) =>
			q.eq("sourceDocumentId", sourceDocumentId),
		)
		.order("asc")
		.collect();
}

export async function replacePagesForSourceDocumentFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
		pages: PageInput[];
	},
) {
	requireServiceSecret(input.serviceSecret);
	const sourceDocument = await ctx.db.get(input.sourceDocumentId);

	if (!sourceDocument) {
		throw new Error("Source Document not found");
	}
	if (sourceDocument.processingStatus !== "processing") {
		return { ignored: true as const };
	}

	for (const page of await ctx.db
		.query("pages")
		.withIndex("by_source_document", (q) =>
			q.eq("sourceDocumentId", input.sourceDocumentId),
		)
		.collect()) {
		await ctx.db.delete(page._id);
	}

	for (const block of await ctx.db
		.query("blocks")
		.withIndex("by_source_document", (q) =>
			q.eq("sourceDocumentId", input.sourceDocumentId),
		)
		.collect()) {
		await ctx.db.delete(block._id);
	}

	for (const page of input.pages) {
		await ctx.db.insert("pages", {
			sourceDocumentId: input.sourceDocumentId,
			physicalPageNumber: page.physicalPageNumber,
			width: page.width,
			height: page.height,
		});
	}

	return { ignored: false as const };
}

async function requireOwnedSourceDocument(
	ctx: QueryCtx | MutationCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	const reader = await requireReader(ctx);
	const sourceDocument = await ctx.db.get(sourceDocumentId);

	if (!sourceDocument || sourceDocument.readerId !== reader._id) {
		throw new Error("Source Document not found");
	}

	return sourceDocument;
}
