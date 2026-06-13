import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requiredEnv } from "../env";
import { requireReader } from "./auth";

interface ProcessingEventInsert extends ProcessingEventInput {
	sourceDocumentId: Id<"sourceDocuments">;
}

export async function listProcessingEventsForSourceDocument(
	ctx: QueryCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	await requireOwnedSourceDocument(ctx, sourceDocumentId);

	return ctx.db
		.query("processingEvents")
		.withIndex("by_source_document", (q) =>
			q.eq("sourceDocumentId", sourceDocumentId),
		)
		.order("asc")
		.collect();
}

export async function authorizeProcessingEventStream(
	ctx: QueryCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	await requireOwnedSourceDocument(ctx, sourceDocumentId);
	return true;
}

export async function getProcessingEventIngestMetadata(
	ctx: QueryCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
	},
) {
	requireServiceSecret(input.serviceSecret);

	const sourceDocument = await ctx.db.get(input.sourceDocumentId);
	if (!sourceDocument) {
		throw new Error("Source Document not found");
	}

	return {
		sourceDocumentId: sourceDocument._id,
		processingRunStartedAt: sourceDocument.processingRun.startedAt,
	};
}

export async function appendProcessingEventFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
		event: ProcessingEventInput;
	},
) {
	requireServiceSecret(input.serviceSecret);

	const sourceDocument = await ctx.db.get(input.sourceDocumentId);
	if (!sourceDocument) {
		throw new Error("Source Document not found");
	}

	return insertProcessingEvent(ctx, {
		sourceDocumentId: input.sourceDocumentId,
		...input.event,
	});
}

export function appendInitialProcessingStartedEvent(
	ctx: MutationCtx,
	sourceDocumentId: Id<"sourceDocuments">,
	emittedAt: number,
) {
	return insertProcessingEvent(ctx, {
		sourceDocumentId,
		type: "processing.started",
		emitter: "app",
		severity: "info",
		message: "Processing Run started.",
		emittedAt,
	});
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

async function insertProcessingEvent(
	ctx: MutationCtx,
	input: ProcessingEventInsert,
): Promise<Doc<"processingEvents">> {
	const event = {
		sourceDocumentId: input.sourceDocumentId,
		type: input.type,
		emitter: input.emitter,
		severity: input.severity,
		message: input.message,
		emittedAt: input.emittedAt,
	} satisfies Omit<
		Doc<"processingEvents">,
		"_id" | "_creationTime" | "pageNumber" | "blockId" | "progress" | "data"
	>;

	const eventId = await ctx.db.insert("processingEvents", {
		...event,
		...(input.pageNumber !== undefined ? { pageNumber: input.pageNumber } : {}),
		...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
		...(input.progress !== undefined ? { progress: input.progress } : {}),
		...(input.data !== undefined ? { data: input.data } : {}),
	});
	const insertedEvent = await ctx.db.get(eventId);

	if (!insertedEvent) {
		throw new Error("Could not load inserted Processing Event");
	}

	return insertedEvent;
}

function requireServiceSecret(serviceSecret: string) {
	if (serviceSecret !== requiredEnv("API_TO_CONVEX_SERVICE_SECRET")) {
		throw new Error("Unauthenticated");
	}
}
