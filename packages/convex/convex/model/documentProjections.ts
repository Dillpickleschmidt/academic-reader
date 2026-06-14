import type { BlockType } from "@academic-reader/shared/blocks";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { insertProcessingEvent } from "./processingEvents";
import { requireServiceSecret } from "./documents";

export interface DocumentProjectionPageInput {
	physicalPageNumber: number;
	width: number;
	height: number;
}

export interface DocumentProjectionBlockInput {
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

export type ReplaceDocumentProjectionResult =
	| { ignored: true }
	| {
			ignored: false;
			status: "ready" | "readyWithWarnings";
			pageCount: number;
			blockCount: number;
			events: Doc<"processingEvents">[];
	  };

export async function replaceDocumentProjectionFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		pages: DocumentProjectionPageInput[];
		blocks: DocumentProjectionBlockInput[];
		warnings: string[];
		imageCount: number;
		emittedAt: number;
	},
): Promise<ReplaceDocumentProjectionResult> {
	requireServiceSecret(input.serviceSecret);
	const document = await ctx.db.get("documents", input.documentId);

	if (!document) {
		throw new Error("Document not found");
	}
	if (document.processingStatus !== "processing") {
		return { ignored: true };
	}

	for (const page of await ctx.db
		.query("pages")
		.withIndex("by_document_physical_page", (q) =>
			q.eq("documentId", input.documentId),
		)
		.collect()) {
		await ctx.db.delete("pages", page._id);
	}

	for (const block of await ctx.db
		.query("blocks")
		.withIndex("by_document_order", (q) => q.eq("documentId", input.documentId))
		.collect()) {
		await ctx.db.delete("blocks", block._id);
	}

	for (const page of input.pages) {
		await ctx.db.insert("pages", {
			documentId: input.documentId,
			physicalPageNumber: page.physicalPageNumber,
			width: page.width,
			height: page.height,
		});
	}

	for (const block of input.blocks) {
		await ctx.db.insert("blocks", {
			documentId: input.documentId,
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

	const status = input.warnings.length ? "readyWithWarnings" : "ready";
	const now = Date.now();
	await ctx.db.patch("documents", input.documentId, {
		pageCount: input.pages.length,
		processingStatus: status,
		processingRun: {
			...document.processingRun,
			finishedAt: now,
		},
		updatedAt: now,
	});

	const events: Doc<"processingEvents">[] = [];
	if (input.warnings.length) {
		events.push(
			await insertProcessingEvent(ctx, {
				documentId: input.documentId,
				...conversionWarningEvent(input.warnings, input.emittedAt),
			}),
		);
	}
	events.push(
		await insertProcessingEvent(ctx, {
			documentId: input.documentId,
			...conversionCompletedEvent({
				status,
				pageCount: input.pages.length,
				blockCount: input.blocks.length,
				imageCount: input.imageCount,
				warningCount: input.warnings.length,
				emittedAt: input.emittedAt,
			}),
		}),
	);

	return {
		ignored: false,
		status,
		pageCount: input.pages.length,
		blockCount: input.blocks.length,
		events,
	};
}

function conversionWarningEvent(
	warnings: string[],
	emittedAt: number,
): ProcessingEventInput {
	return {
		type: "conversion.warning",
		emitter: "app",
		severity: "warning",
		message: "Marker conversion completed with warnings.",
		emittedAt,
		data: { warnings },
	};
}

function conversionCompletedEvent(input: {
	status: "ready" | "readyWithWarnings";
	pageCount: number;
	blockCount: number;
	imageCount: number;
	warningCount: number;
	emittedAt: number;
}): ProcessingEventInput {
	return {
		type: "conversion.completed",
		emitter: "app",
		severity: "info",
		message: "Marker conversion completed and Pages/Blocks were persisted.",
		emittedAt: input.emittedAt,
		data: {
			status: input.status,
			pageCount: input.pageCount,
			blockCount: input.blockCount,
			imageCount: input.imageCount,
			warningCount: input.warningCount,
		},
	};
}
