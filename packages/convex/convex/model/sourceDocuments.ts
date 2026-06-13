import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireReader } from "./auth";
import { saveConfigurationPreferences } from "./configurationPreferences";

export async function listSourceDocuments(ctx: QueryCtx) {
	const reader = await requireReader(ctx);

	return ctx.db
		.query("sourceDocuments")
		.withIndex("by_reader", (q) => q.eq("readerId", reader._id))
		.order("desc")
		.collect();
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

	return ctx.db.insert("sourceDocuments", {
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
}
