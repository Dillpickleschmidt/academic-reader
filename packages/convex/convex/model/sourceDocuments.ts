import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requiredEnv } from "../env";
import { requireReader } from "./auth";
import { saveConfigurationPreferences } from "./configurationPreferences";
import {
	appendInitialProcessingStartedEvent,
	insertProcessingEvent,
} from "./processingEvents";

export async function listSourceDocuments(ctx: QueryCtx) {
	const reader = await requireReader(ctx);

	return ctx.db
		.query("sourceDocuments")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.order("desc")
		.collect();
}

export async function getSourceDocument(
	ctx: QueryCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	return requireOwnedSourceDocument(ctx, sourceDocumentId);
}

export async function createSourceDocumentFromPromotedUpload(
	ctx: MutationCtx,
	input: {
		filename: string;
		mimeType: string;
		sizeBytes: number;
		storageObjectKey: string;
		processingConfiguration: {
			conversionModel: string;
			pageRange: string;
			markerOptions: {
				forceOcr: boolean;
				useLlm: boolean;
			};
			narration: {
				enabled: boolean;
				voice: string;
			};
		};
	},
) {
	const reader = await requireReader(ctx);
	const now = Date.now();
	const processingConfiguration = {
		...input.processingConfiguration,
		pageRange: input.processingConfiguration.pageRange.trim(),
	};

	await saveConfigurationPreferences(ctx, {
		conversionModel: processingConfiguration.conversionModel,
		markerForceOcr: processingConfiguration.markerOptions.forceOcr,
		markerUseLlm: processingConfiguration.markerOptions.useLlm,
		narrationEnabled: processingConfiguration.narration.enabled,
		narrationVoice: processingConfiguration.narration.voice,
	});

	const sourceDocumentId = await ctx.db.insert("sourceDocuments", {
		readerId: reader._id,
		filename: input.filename,
		mimeType: input.mimeType,
		sizeBytes: input.sizeBytes,
		pageCount: null,
		storageObjectKey: input.storageObjectKey,
		processingConfiguration,
		processingRun: {
			startedAt: now,
			finishedAt: null,
		},
		processingStatus: "processing",
		createdAt: now,
		updatedAt: now,
	});

	await appendInitialProcessingStartedEvent(ctx, sourceDocumentId, now);

	return sourceDocumentId;
}

export async function getProcessingInputForApi(
	ctx: QueryCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
	},
) {
	requireServiceSecret(input.serviceSecret);
	const sourceDocument = await ctx.db.get(
		"sourceDocuments",
		input.sourceDocumentId,
	);

	if (!sourceDocument) {
		throw new Error("Source Document not found");
	}

	return {
		sourceDocumentId: sourceDocument._id,
		storageObjectKey: sourceDocument.storageObjectKey,
		processingConfiguration: sourceDocument.processingConfiguration,
		processingRunStartedAt: sourceDocument.processingRun.startedAt,
		processingStatus: sourceDocument.processingStatus,
	};
}

export async function failProcessingFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		sourceDocumentId: Id<"sourceDocuments">;
		message: string;
		emittedAt: number;
	},
): Promise<
	{ ignored: true } | { ignored: false; event: Doc<"processingEvents"> }
> {
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

	const now = Date.now();
	await ctx.db.patch("sourceDocuments", input.sourceDocumentId, {
		processingStatus: "failed",
		processingRun: {
			...sourceDocument.processingRun,
			finishedAt: now,
		},
		updatedAt: now,
	});

	const event = await insertProcessingEvent(ctx, {
		sourceDocumentId: input.sourceDocumentId,
		...conversionFailedEvent(input.message, input.emittedAt),
	});

	return { ignored: false, event };
}

async function requireOwnedSourceDocument(
	ctx: QueryCtx | MutationCtx,
	sourceDocumentId: Id<"sourceDocuments">,
) {
	const reader = await requireReader(ctx);
	const sourceDocument = await ctx.db.get("sourceDocuments", sourceDocumentId);

	if (!sourceDocument || sourceDocument.readerId !== reader._id) {
		throw new Error("Source Document not found");
	}

	return sourceDocument;
}

export function requireServiceSecret(serviceSecret: string) {
	if (serviceSecret !== requiredEnv("API_TO_CONVEX_SERVICE_SECRET")) {
		throw new Error("Unauthenticated");
	}
}

function conversionFailedEvent(
	message: string,
	emittedAt: number,
): ProcessingEventInput {
	return {
		type: "conversion.failed",
		emitter: "app",
		severity: "error",
		message,
		emittedAt,
	};
}
