import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requiredEnv } from "../env";
import { requireReader } from "./auth";
import { saveConfigurationPreferences } from "./configurationPreferences";
import {
	appendInitialProcessingStartedEvent,
	insertProcessingEvent,
} from "./processingEvents";

export async function listDocuments(ctx: QueryCtx) {
	const reader = await requireReader(ctx);

	return ctx.db
		.query("documents")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.order("desc")
		.collect();
}

export async function getDocument(ctx: QueryCtx, documentId: Id<"documents">) {
	return requireOwnedDocument(ctx, documentId);
}

export async function createDocumentFromPromotedSourceDocument(
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

	const documentId = await ctx.db.insert("documents", {
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

	await appendInitialProcessingStartedEvent(ctx, documentId, now);

	return documentId;
}

export async function getProcessingInputForApi(
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
		mimeType: document.mimeType,
		storageObjectKey: document.storageObjectKey,
		processingConfiguration: document.processingConfiguration,
		processingRunStartedAt: document.processingRun.startedAt,
		processingStatus: document.processingStatus,
	};
}

export async function setNarrationGuideFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		narrationGuide: string;
	},
): Promise<{ ok: true }> {
	requireServiceSecret(input.serviceSecret);
	const document = await ctx.db.get("documents", input.documentId);

	if (!document) {
		throw new Error("Document not found");
	}

	const narrationGuide = input.narrationGuide.trim();
	if (!narrationGuide) {
		throw new Error("Narration Guide cannot be empty");
	}

	await ctx.db.patch("documents", input.documentId, {
		narrationGuide,
		updatedAt: Date.now(),
	});

	return { ok: true };
}

export async function failProcessingFromApi(
	ctx: MutationCtx,
	input: {
		serviceSecret: string;
		documentId: Id<"documents">;
		message: string;
		emittedAt: number;
	},
): Promise<{ ignored: true } | { ignored: false }> {
	requireServiceSecret(input.serviceSecret);
	const document = await ctx.db.get("documents", input.documentId);

	if (!document) {
		throw new Error("Document not found");
	}
	if (document.processingStatus !== "processing") {
		return { ignored: true };
	}

	const now = Date.now();
	await ctx.db.patch("documents", input.documentId, {
		processingStatus: "failed",
		processingRun: {
			...document.processingRun,
			finishedAt: now,
		},
		updatedAt: now,
	});

	await insertProcessingEvent(ctx, {
		documentId: input.documentId,
		...conversionFailedEvent(input.message, input.emittedAt),
	});

	return { ignored: false };
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
