import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requiredEnv } from "../env";
import { requireReader } from "./auth";

interface ProcessingEventInsert extends ProcessingEventInput {
	documentId: Id<"documents">;
}

export async function listProcessingEventsForDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	await requireOwnedDocument(ctx, documentId);

	return ctx.db
		.query("processingEvents")
		.withIndex("by_document", (q) => q.eq("documentId", documentId))
		.order("asc")
		.collect();
}

export async function getProcessingEventIngestMetadata(
	ctx: QueryCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
	},
) {
	requireServiceSecret(input.serviceSecret);

	const document = await ctx.db.get("documents", input.documentId);
	if (!document) {
		throw new Error("Document not found");
	}

	return {
		documentId: document._id,
		processingRunStartedAt: document.processingRun.startedAt,
	};
}

export async function appendProcessingEventFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		event: ProcessingEventInput;
	},
) {
	requireServiceSecret(input.serviceSecret);

	const document = await ctx.db.get("documents", input.documentId);
	if (!document) {
		throw new Error("Document not found");
	}

	await insertProcessingEvent(ctx, {
		documentId: input.documentId,
		...input.event,
	});

	return { ok: true as const };
}

export function appendInitialProcessingStartedEvent(
	ctx: MutationCtx,
	documentId: Id<"documents">,
	emittedAt: number,
) {
	return insertProcessingEvent(ctx, {
		documentId,
		type: "processing.started",
		emitter: "app",
		severity: "info",
		message: "Processing Run started.",
		emittedAt,
	});
}

export async function insertProcessingEvent(
	ctx: MutationCtx,
	input: ProcessingEventInsert,
) {
	await ctx.db.insert("processingEvents", {
		documentId: input.documentId,
		type: input.type,
		emitter: input.emitter,
		severity: input.severity,
		message: input.message,
		emittedAt: input.emittedAt,
		...(input.pageNumber !== undefined ? { pageNumber: input.pageNumber } : {}),
		...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
		...(input.progress !== undefined ? { progress: input.progress } : {}),
		...(input.data !== undefined ? { data: input.data } : {}),
	});
}

async function requireOwnedDocument(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
) {
	const reader = await requireReader(ctx);
	const document = await ctx.db.get("documents", documentId);

	if (!document || document.readerId !== reader._id) {
		throw new Error("Document not found");
	}

	return document;
}

function requireServiceSecret(serviceSecret: string) {
	if (serviceSecret !== requiredEnv("API_TO_CONVEX_SERVICE_SECRET")) {
		throw new Error("Unauthenticated");
	}
}
