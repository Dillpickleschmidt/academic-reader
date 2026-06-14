import type { BlockType } from "@academic-reader/shared/blocks";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { insertProcessingEvent } from "./processingEvents";
import { requireServiceSecret } from "./sourceDocuments";

export interface SourceDocumentProjectionPageInput {
	physicalPageNumber: number;
	width: number;
	height: number;
}

export interface SourceDocumentProjectionBlockInput {
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

export type ReplaceSourceDocumentProjectionResult =
	| { ignored: true }
	| {
			ignored: false;
			status: "ready" | "readyWithWarnings";
			pageCount: number;
			blockCount: number;
			events: Doc<"processingEvents">[];
	  };

export async function replaceSourceDocumentProjectionFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
		pages: SourceDocumentProjectionPageInput[];
		blocks: SourceDocumentProjectionBlockInput[];
		warnings: string[];
		imageCount: number;
		emittedAt: number;
	},
): Promise<ReplaceSourceDocumentProjectionResult> {
	requireServiceSecret(input.serviceSecret);
	const sourceDocument = await ctx.db.get(
		"sourceDocuments",
		input.sourceDocumentId,
	);

	if (!sourceDocument) {
		throw new Error("Source Document not found");
	}
	if (sourceDocument.processingStatus !== "processing") {
		return { ignored: true };
	}

	for (const page of await ctx.db
		.query("pages")
		.withIndex("by_source_document_physical_page", (q) =>
			q.eq("sourceDocumentId", input.sourceDocumentId),
		)
		.collect()) {
		await ctx.db.delete("pages", page._id);
	}

	for (const block of await ctx.db
		.query("blocks")
		.withIndex("by_source_document_order", (q) =>
			q.eq("sourceDocumentId", input.sourceDocumentId),
		)
		.collect()) {
		await ctx.db.delete("blocks", block._id);
	}

	for (const page of input.pages) {
		await ctx.db.insert("pages", {
			sourceDocumentId: input.sourceDocumentId,
			physicalPageNumber: page.physicalPageNumber,
			width: page.width,
			height: page.height,
		});
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

	const status = input.warnings.length ? "readyWithWarnings" : "ready";
	const now = Date.now();
	await ctx.db.patch("sourceDocuments", input.sourceDocumentId, {
		pageCount: input.pages.length,
		processingStatus: status,
		processingRun: {
			...sourceDocument.processingRun,
			finishedAt: now,
		},
		updatedAt: now,
	});

	const events: Doc<"processingEvents">[] = [];
	if (input.warnings.length) {
		events.push(
			await insertProcessingEvent(ctx, {
				sourceDocumentId: input.sourceDocumentId,
				...conversionWarningEvent(input.warnings, input.emittedAt),
			}),
		);
	}
	events.push(
		await insertProcessingEvent(ctx, {
			sourceDocumentId: input.sourceDocumentId,
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
