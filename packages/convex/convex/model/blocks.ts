import type { BlockType } from "@academic-reader/shared/blocks";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";
import { requireServiceSecret } from "./sourceDocuments";

export interface BlockInput {
	blockId: string;
	blockType: BlockType;
	rawBlockType: string;
	order: number;
	contentHtml: string;
	contentMarkdown?: string;
	pageNumber?: number;
	normalizedBoundingBox?: {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

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

export async function insertBlocksForSourceDocumentFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
		blocks: BlockInput[];
	},
) {
	requireServiceSecret(input.serviceSecret);
	const sourceDocument = await ctx.db.get(input.sourceDocumentId);

	if (!sourceDocument) {
		throw new Error("Source Document not found");
	}
	if (sourceDocument.processingStatus !== "processing") {
		return { ignored: true as const, inserted: 0 };
	}

	for (const block of input.blocks) {
		await ctx.db.insert("blocks", {
			sourceDocumentId: input.sourceDocumentId,
			blockId: block.blockId,
			blockType: block.blockType,
			rawBlockType: block.rawBlockType,
			order: block.order,
			contentHtml: block.contentHtml,
			...(block.contentMarkdown !== undefined
				? { contentMarkdown: block.contentMarkdown }
				: {}),
			...(block.pageNumber !== undefined
				? { pageNumber: block.pageNumber }
				: {}),
			...(block.normalizedBoundingBox !== undefined
				? { normalizedBoundingBox: block.normalizedBoundingBox }
				: {}),
		});
	}

	return { ignored: false as const, inserted: input.blocks.length };
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
