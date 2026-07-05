import {
	isTerminalEventType,
	type ProcessingEventInput,
} from "@academic-reader/shared/processing-events";
import {
	applyProcessingEventToProgressSummary,
	deriveProcessingProgressSummary,
	emptyProcessingProgressSummary,
	normalizeProcessingProgressSummary,
} from "@academic-reader/shared/processing-phases";
import type { Doc, Id } from "../_generated/dataModel";
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

export async function getProcessingProgressSummaryForDocument(
	ctx: QueryCtx,
	documentId: Id<"documents">,
) {
	const document = await requireOwnedDocument(ctx, documentId);
	const view = await ctx.db
		.query("processingRunViews")
		.withIndex("by_document", (q) => q.eq("documentId", documentId))
		.first();

	if (view) {
		return normalizeProcessingProgressSummary(
			{
				documentId: view.documentId,
				eventCount: view.eventCount,
				phases: view.phases,
			},
			document.processingStatus,
		);
	}

	const events = await listProcessingEventsByDocument(ctx, documentId);
	return deriveSummaryForDocument(documentId, events, document.processingStatus);
}

export async function deleteProcessingRunViewForDocument(
	ctx: MutationCtx,
	documentId: Id<"documents">,
) {
	for (const view of await ctx.db
		.query("processingRunViews")
		.withIndex("by_document", (q) => q.eq("documentId", documentId))
		.collect()) {
		await ctx.db.delete(view._id);
	}
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
	const document = await ctx.db.get(input.documentId);
	if (!document) {
		throw new Error("Document not found");
	}

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

	await upsertProcessingRunView(ctx, document, input);
}

async function upsertProcessingRunView(
	ctx: MutationCtx,
	document: Doc<"documents">,
	event: ProcessingEventInput,
) {
	const existing = await ctx.db
		.query("processingRunViews")
		.withIndex("by_document", (q) => q.eq("documentId", document._id))
		.first();
	const now = Date.now();
	const active = processingRunActive(document, event);

	if (!existing) {
		const events = await listProcessingEventsByDocument(ctx, document._id);
		const summary = deriveSummaryForDocument(
			document._id,
			events,
			document.processingStatus,
		);
		await ctx.db.insert("processingRunViews", {
			readerId: document.readerId,
			documentId: document._id,
			active,
			eventCount: summary.eventCount,
			phases: summary.phases,
			updatedAt: now,
		});
		return;
	}

	const summary = applyProcessingEventToProgressSummary(
		{
			documentId: existing.documentId,
			eventCount: existing.eventCount,
			phases: existing.phases,
		},
		event,
		document.processingStatus,
	);

	await ctx.db.patch(existing._id, {
		readerId: document.readerId,
		active,
		eventCount: summary.eventCount,
		phases: summary.phases,
		updatedAt: now,
	});
}

function processingRunActive(
	document: Doc<"documents">,
	latestEvent: ProcessingEventInput,
): boolean {
	const status = document.processingStatus;
	if (status === "created" || status === "processing" || status === "failed") {
		return true;
	}
	if (
		!document.processingConfiguration.narration.enabled &&
		!document.processingConfiguration.equationExplanations.enabled
	) {
		return false;
	}
	return !isTerminalEventType(latestEvent.type);
}

async function listProcessingEventsByDocument(
	ctx: QueryCtx | MutationCtx,
	documentId: Id<"documents">,
) {
	return ctx.db
		.query("processingEvents")
		.withIndex("by_document", (q) => q.eq("documentId", documentId))
		.order("asc")
		.collect();
}

function deriveSummaryForDocument(
	documentId: Id<"documents">,
	events: Doc<"processingEvents">[],
	processingStatus: string,
) {
	if (!events.length) {
		return emptyProcessingProgressSummary(documentId, processingStatus);
	}

	return {
		...deriveProcessingProgressSummary(events, processingStatus),
		documentId,
	};
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
