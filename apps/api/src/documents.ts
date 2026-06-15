import type { Id } from "@academic-reader/convex/data-model";
import type { SourceDocumentMimeType } from "@academic-reader/shared/uploads";
import { markInlineCitationsInHtml } from "./block-content";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";
import { submitMarkerProcessing } from "./marker";
import {
	adaptMarkerConversionResult,
	collectMarkerImages,
	decodeBase64Image,
	normalizeMarkerConversionResult,
} from "./marker-result";
import { startNarrationInBackground } from "./narration-eligibility";
import {
	extractPdfPageLabelsAndOutline,
	type PdfMetadataBlockCandidate,
} from "./pdf-metadata";
import {
	createProcessingEventIngestToken,
	isMatchingProcessingEventIngestToken,
} from "./processing-event-ingest-token";
import {
	documentImageObjectKey,
	documentImageUrl,
	getBrowserPresignedReadUrl,
	getObjectBytes,
	getWorkerPresignedReadUrl,
	promoteTemporaryUpload,
	saveObject,
} from "./storage";

export interface DocumentProcessingConfiguration {
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

export interface CreateDocumentAndStartProcessingInput {
	authToken: string;
	temporaryUploadId: string;
	filename: string;
	mimeType: SourceDocumentMimeType;
	sizeBytes: number;
	processingConfiguration: DocumentProcessingConfiguration;
}

export type CreateDocumentAndStartProcessingResult =
	| {
			documentId: Id<"documents">;
			processingStarted: true;
	  }
	| {
			documentId: Id<"documents">;
			processingStarted: false;
			error: string;
	  };

export type AcceptMarkerResultResult =
	| { ignored: true }
	| { failed: true }
	| { status: "ready" | "readyWithWarnings" };

export async function createDocumentAndStartProcessing(
	input: CreateDocumentAndStartProcessingInput,
): Promise<CreateDocumentAndStartProcessingResult> {
	const promotedUpload = await promoteTemporaryUpload({
		temporaryUploadId: input.temporaryUploadId,
		filename: input.filename,
	});
	const documentId = await createConvexHttpClient(input.authToken).mutation(
		api.api.documents.createFromPromotedSourceDocument,
		{
			filename: input.filename,
			mimeType: input.mimeType,
			sizeBytes: input.sizeBytes,
			storageObjectKey: promotedUpload.objectKey,
			processingConfiguration: input.processingConfiguration,
		},
	);

	try {
		await startMarkerProcessing(documentId);
		return { documentId, processingStarted: true };
	} catch (startError) {
		const message = errorMessage(startError);
		await failProcessing(documentId, message);
		return { documentId, processingStarted: false, error: message };
	}
}

export async function acceptMarkerResult(input: {
	documentId: Id<"documents">;
	ingestToken: string;
	result?: unknown;
	error?: string;
}): Promise<AcceptMarkerResultResult> {
	let isValidatedCallback = false;

	try {
		const metadata = await getValidatedIngestMetadata({
			documentId: input.documentId,
			ingestToken: input.ingestToken,
		});
		isValidatedCallback = true;

		if (metadata.processingStatus !== "processing") {
			return { ignored: true };
		}

		if (input.error) {
			await failProcessing(input.documentId, input.error);
			return { failed: true };
		}
		if (input.result === undefined) {
			throw new Error("Marker result callback is missing result");
		}

		const result = normalizeMarkerConversionResult(input.result);
		const imageUrls = await saveMarkerImages(
			input.documentId,
			collectMarkerImages(result),
		);
		const adapted = adaptMarkerConversionResult({ result, imageUrls });
		const blocks = adapted.blocks.map((block) => ({
			...block,
			contentHtml: markInlineCitationsInHtml(block.contentHtml),
		}));
		const pdfMetadata = await documentPdfMetadata({
			blocks,
			mimeType: metadata.mimeType,
			storageObjectKey: metadata.storageObjectKey,
			warnings: adapted.warnings,
		});
		const projection = await createConvexHttpClient().mutation(
			api.api.documentProjections.replaceFromApi,
			{
				serviceSecret: readApiToConvexServiceSecret(),
				documentId: input.documentId,
				pages: adapted.pages.map((page) => {
					const pageLabel = pdfMetadata.pageLabelsByPhysicalPageNumber.get(
						page.physicalPageNumber,
					);
					return pageLabel ? { ...page, pageLabel } : page;
				}),
				blocks,
				tableOfContentsEntries: pdfMetadata.tableOfContentsEntries,
				warnings: adapted.warnings,
				imageCount: Object.keys(imageUrls).length,
				emittedAt: Date.now(),
			},
		);

		if (projection.ignored) return { ignored: true };
		if (metadata.processingConfiguration.narration.enabled) {
			startNarrationInBackground(input.documentId);
		}

		return { status: projection.status };
	} catch (error) {
		if (isValidatedCallback) {
			await failProcessing(input.documentId, errorMessage(error)).catch(
				() => undefined,
			);
		}
		throw error;
	}
}

export async function createDocumentSourceAccess(input: {
	authToken: string;
	documentId: Id<"documents">;
}) {
	const document = await createConvexHttpClient(input.authToken).query(
		api.api.documents.get,
		{
			documentId: input.documentId,
		},
	);
	const access = await getBrowserPresignedReadUrl(document.storageObjectKey);

	return {
		...access,
		filename: document.filename,
		mimeType: document.mimeType,
	};
}

export async function createDocumentImageAccess(input: {
	authToken: string;
	documentId: Id<"documents">;
	filenames: string[];
}) {
	await createConvexHttpClient(input.authToken).query(api.api.documents.get, {
		documentId: input.documentId,
	});
	const urls: Record<string, string> = {};
	let expiresAt = new Date().toISOString();

	for (const filename of new Set(input.filenames)) {
		const access = await getBrowserPresignedReadUrl(
			documentImageObjectKey(input.documentId, filename),
		);
		urls[filename] = access.url;
		expiresAt = access.expiresAt;
	}

	return { urls, expiresAt };
}

async function documentPdfMetadata(input: {
	blocks: PdfMetadataBlockCandidate[];
	mimeType: string;
	storageObjectKey: string;
	warnings: string[];
}) {
	if (input.mimeType !== "application/pdf") {
		return {
			pageLabelsByPhysicalPageNumber: new Map<number, string>(),
			tableOfContentsEntries: [],
		};
	}

	try {
		return await extractPdfPageLabelsAndOutline({
			bytes: await getObjectBytes(input.storageObjectKey),
			blocks: input.blocks,
		});
	} catch (error) {
		input.warnings.push(`PDF metadata ignored: ${errorMessage(error)}`);
		return {
			pageLabelsByPhysicalPageNumber: new Map<number, string>(),
			tableOfContentsEntries: [],
		};
	}
}

async function startMarkerProcessing(documentId: Id<"documents">) {
	const serviceSecret = readApiToConvexServiceSecret();
	const client = createConvexHttpClient();
	const input = await client.query(api.api.documents.getProcessingInputForApi, {
		serviceSecret,
		documentId,
	});
	const ingestToken = createProcessingEventIngestToken({
		serviceSecret,
		documentId,
		processingRunStartedAt: input.processingRunStartedAt,
	});
	const fileUrl = await getWorkerPresignedReadUrl(input.storageObjectKey);

	await submitMarkerProcessing({
		documentId,
		fileUrl,
		ingestToken,
		useLlm: input.processingConfiguration.markerOptions.useLlm,
		forceOcr: input.processingConfiguration.markerOptions.forceOcr,
		pageRange: input.processingConfiguration.pageRange,
	});
}

async function failProcessing(documentId: Id<"documents">, message: string) {
	await createConvexHttpClient().mutation(
		api.api.documents.failProcessingFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
			message,
			emittedAt: Date.now(),
		},
	);
}

async function getValidatedIngestMetadata(input: {
	documentId: Id<"documents">;
	ingestToken: string;
}) {
	const serviceSecret = readApiToConvexServiceSecret();
	const metadata = await createConvexHttpClient().query(
		api.api.documents.getProcessingInputForApi,
		{
			serviceSecret,
			documentId: input.documentId,
		},
	);
	const expectedToken = createProcessingEventIngestToken({
		serviceSecret,
		documentId: metadata.documentId,
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
	documentId: string,
	images: Record<string, string>,
) {
	const imageUrls: Record<string, string> = {};

	for (const [filename, base64] of Object.entries(images)) {
		await saveObject(
			documentImageObjectKey(documentId, filename),
			decodeBase64Image(base64),
			{
				contentType: imageContentType(filename),
				cacheControl: "private, max-age=31536000, immutable",
			},
		);
		imageUrls[filename] = documentImageUrl(documentId, filename);
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
