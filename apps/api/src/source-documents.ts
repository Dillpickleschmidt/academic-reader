import type { Id } from "@academic-reader/convex/data-model";
import type { SourceDocumentMimeType } from "@academic-reader/shared/uploads";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";
import {
	adaptMarkerConversionResult,
	collectMarkerImages,
	decodeBase64Image,
	normalizeMarkerConversionResult,
} from "./marker-result";
import { submitMarkerProcessing } from "./marker";
import { publishProcessingEvent } from "./processing-event-broker";
import {
	createProcessingEventIngestToken,
	isMatchingProcessingEventIngestToken,
} from "./processing-event-ingest-token";
import {
	getBrowserPresignedReadUrl,
	getWorkerPresignedReadUrl,
	promoteTemporaryUpload,
	saveObject,
	sourceDocumentImageObjectKey,
	sourceDocumentImageUrl,
} from "./storage";

export interface SourceDocumentProcessingConfiguration {
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
}

export interface CreateSourceDocumentAndStartProcessingInput {
	authToken: string;
	temporaryUploadId: string;
	filename: string;
	mimeType: SourceDocumentMimeType;
	sizeBytes: number;
	processingConfiguration: SourceDocumentProcessingConfiguration;
}

export type CreateSourceDocumentAndStartProcessingResult =
	| {
			sourceDocumentId: Id<"sourceDocuments">;
			processingStarted: true;
	  }
	| {
			sourceDocumentId: Id<"sourceDocuments">;
			processingStarted: false;
			error: string;
	  };

export type AcceptMarkerResultResult =
	| { ignored: true }
	| { failed: true }
	| { status: "ready" | "readyWithWarnings" };

export async function createSourceDocumentAndStartProcessing(
	input: CreateSourceDocumentAndStartProcessingInput,
): Promise<CreateSourceDocumentAndStartProcessingResult> {
	const promotedUpload = await promoteTemporaryUpload({
		temporaryUploadId: input.temporaryUploadId,
		filename: input.filename,
	});
	const sourceDocumentId = await createConvexHttpClient(
		input.authToken,
	).mutation(api.api.sourceDocuments.createFromPromotedUpload, {
		filename: input.filename,
		mimeType: input.mimeType,
		sizeBytes: input.sizeBytes,
		storageObjectKey: promotedUpload.objectKey,
		processingConfiguration: input.processingConfiguration,
	});

	try {
		await startMarkerProcessing(sourceDocumentId);
		return { sourceDocumentId, processingStarted: true };
	} catch (startError) {
		const message = errorMessage(startError);
		await failProcessing(sourceDocumentId, message);
		return { sourceDocumentId, processingStarted: false, error: message };
	}
}

export async function acceptMarkerResult(input: {
	sourceDocumentId: Id<"sourceDocuments">;
	ingestToken: string;
	result?: unknown;
	error?: string;
}): Promise<AcceptMarkerResultResult> {
	let isValidatedCallback = false;

	try {
		const metadata = await getValidatedIngestMetadata({
			sourceDocumentId: input.sourceDocumentId,
			ingestToken: input.ingestToken,
		});
		isValidatedCallback = true;

		if (metadata.processingStatus !== "processing") {
			return { ignored: true };
		}

		if (input.error) {
			await failProcessing(input.sourceDocumentId, input.error);
			return { failed: true };
		}
		if (input.result === undefined) {
			throw new Error("Marker result callback is missing result");
		}

		const result = normalizeMarkerConversionResult(input.result);
		const imageUrls = await saveMarkerImages(
			input.sourceDocumentId,
			collectMarkerImages(result),
		);
		const adapted = adaptMarkerConversionResult({ result, imageUrls });
		const projection = await createConvexHttpClient().mutation(
			api.api.sourceDocumentProjections.replaceFromApi,
			{
				serviceSecret: readApiToConvexServiceSecret(),
				sourceDocumentId: input.sourceDocumentId,
				pages: adapted.pages,
				blocks: adapted.blocks,
				warnings: adapted.warnings,
				imageCount: Object.keys(imageUrls).length,
				emittedAt: Date.now(),
			},
		);

		if (projection.ignored) return { ignored: true };
		for (const event of projection.events) publishProcessingEvent(event);

		return { status: projection.status };
	} catch (error) {
		if (isValidatedCallback) {
			await failProcessing(input.sourceDocumentId, errorMessage(error)).catch(
				() => undefined,
			);
		}
		throw error;
	}
}

export async function createSourceDocumentSourceAccess(input: {
	authToken: string;
	sourceDocumentId: Id<"sourceDocuments">;
}) {
	const sourceDocument = await createConvexHttpClient(input.authToken).query(
		api.api.sourceDocuments.get,
		{
			sourceDocumentId: input.sourceDocumentId,
		},
	);
	const access = await getBrowserPresignedReadUrl(
		sourceDocument.storageObjectKey,
	);

	return {
		...access,
		filename: sourceDocument.filename,
		mimeType: sourceDocument.mimeType,
	};
}

export async function createSourceDocumentImageAccess(input: {
	authToken: string;
	sourceDocumentId: Id<"sourceDocuments">;
	filenames: string[];
}) {
	await createConvexHttpClient(input.authToken).query(
		api.api.sourceDocuments.get,
		{
			sourceDocumentId: input.sourceDocumentId,
		},
	);
	const urls: Record<string, string> = {};
	let expiresAt = new Date().toISOString();

	for (const filename of new Set(input.filenames)) {
		const access = await getBrowserPresignedReadUrl(
			sourceDocumentImageObjectKey(input.sourceDocumentId, filename),
		);
		urls[filename] = access.url;
		expiresAt = access.expiresAt;
	}

	return { urls, expiresAt };
}

async function startMarkerProcessing(sourceDocumentId: Id<"sourceDocuments">) {
	const serviceSecret = readApiToConvexServiceSecret();
	const client = createConvexHttpClient();
	const input = await client.query(
		api.api.sourceDocuments.getProcessingInputForApi,
		{
			serviceSecret,
			sourceDocumentId,
		},
	);
	const ingestToken = createProcessingEventIngestToken({
		serviceSecret,
		sourceDocumentId,
		processingRunStartedAt: input.processingRunStartedAt,
	});
	const fileUrl = await getWorkerPresignedReadUrl(input.storageObjectKey);

	await submitMarkerProcessing({
		sourceDocumentId,
		fileUrl,
		ingestToken,
		useLlm: input.processingConfiguration.markerOptions.useLlm,
		forceOcr: input.processingConfiguration.markerOptions.forceOcr,
		pageRange: input.processingConfiguration.pageRange,
	});
}

async function failProcessing(
	sourceDocumentId: Id<"sourceDocuments">,
	message: string,
) {
	const failed = await createConvexHttpClient().mutation(
		api.api.sourceDocuments.failProcessingFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			sourceDocumentId,
			message,
			emittedAt: Date.now(),
		},
	);
	if (!failed.ignored) publishProcessingEvent(failed.event);
}

async function getValidatedIngestMetadata(input: {
	sourceDocumentId: Id<"sourceDocuments">;
	ingestToken: string;
}) {
	const serviceSecret = readApiToConvexServiceSecret();
	const metadata = await createConvexHttpClient().query(
		api.api.sourceDocuments.getProcessingInputForApi,
		{
			serviceSecret,
			sourceDocumentId: input.sourceDocumentId,
		},
	);
	const expectedToken = createProcessingEventIngestToken({
		serviceSecret,
		sourceDocumentId: metadata.sourceDocumentId,
		processingRunStartedAt: metadata.processingRunStartedAt,
	});

	if (
		!isMatchingProcessingEventIngestToken({
			actualToken: input.ingestToken,
			expectedToken,
		})
	) {
		throw new Error("Unauthenticated");
	}

	return metadata;
}

async function saveMarkerImages(
	sourceDocumentId: string,
	images: Record<string, string>,
) {
	const imageUrls: Record<string, string> = {};

	for (const [filename, base64] of Object.entries(images)) {
		await saveObject(
			sourceDocumentImageObjectKey(sourceDocumentId, filename),
			decodeBase64Image(base64),
			{
				contentType: imageContentType(filename),
				cacheControl: "private, max-age=31536000, immutable",
			},
		);
		imageUrls[filename] = sourceDocumentImageUrl(sourceDocumentId, filename);
	}

	return imageUrls;
}

function imageContentType(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase();
	if (ext === "png") return "image/png";
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	if (ext === "webp") return "image/webp";
	if (ext === "gif") return "image/gif";
	return "image/png";
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
