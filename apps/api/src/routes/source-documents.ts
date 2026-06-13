import type { Id } from "@academic-reader/convex/data-model";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import { conversionModels } from "@academic-reader/shared/processing";
import {
	sourceDocumentMaxSizeBytes,
	sourceDocumentMimeTypes,
} from "@academic-reader/shared/uploads";
import { Hono } from "hono";
import * as v from "valibot";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "../convex";
import {
	adaptMarkerConversionResult,
	collectMarkerImages,
	decodeBase64Image,
	normalizeMarkerConversionResult,
} from "../marker-result";
import { submitMarkerProcessing } from "../marker";
import { publishProcessingEvent } from "../processing-event-broker";
import {
	createProcessingEventIngestToken,
	isMatchingProcessingEventIngestToken,
} from "../processing-event-ingest-token";
import {
	getWorkerPresignedReadUrl,
	promoteTemporaryUpload,
	readObject,
	saveObject,
	sourceDocumentImageObjectKey,
	sourceDocumentImageUrl,
} from "../storage";

const BLOCK_INSERT_BATCH_SIZE = 200;

const processingConfigurationSchema = v.object({
	conversionModel: v.picklist(conversionModels),
	pageRange: v.string(),
	markerOptions: v.object({
		forceOcr: v.boolean(),
		useLlm: v.boolean(),
	}),
	narration: v.object({
		enabled: v.boolean(),
		voice: v.string(),
	}),
});

const createSourceDocumentSchema = v.object({
	temporaryUploadId: v.pipe(v.string(), v.minLength(1)),
	filename: v.pipe(v.string(), v.minLength(1)),
	mimeType: v.picklist(sourceDocumentMimeTypes),
	sizeBytes: v.pipe(
		v.number(),
		v.minValue(1),
		v.maxValue(sourceDocumentMaxSizeBytes),
	),
	processingConfiguration: processingConfigurationSchema,
});

const markerResultSchema = v.object({
	ingestToken: v.pipe(v.string(), v.minLength(1)),
	result: v.optional(v.any()),
	error: v.optional(v.string()),
});

export const sourceDocumentsRoute = new Hono();

sourceDocumentsRoute.post("/", async (c) => {
	const authToken = bearerToken(c.req.header("Authorization"));
	if (!authToken) return c.json({ error: "Unauthenticated" }, 401);

	let input: v.InferOutput<typeof createSourceDocumentSchema>;
	try {
		input = v.parse(createSourceDocumentSchema, await c.req.json());
	} catch (error) {
		return c.json({ error: errorMessage(error) }, 400);
	}

	try {
		const promotedUpload = await promoteTemporaryUpload({
			temporaryUploadId: input.temporaryUploadId,
			filename: input.filename,
		});
		const readerClient = createConvexHttpClient(authToken);
		const sourceDocumentId = await readerClient.mutation(
			api.api.sourceDocuments.createFromPromotedUpload,
			{
				filename: input.filename,
				mimeType: input.mimeType,
				sizeBytes: input.sizeBytes,
				storageObjectKey: promotedUpload.objectKey,
				processingConfiguration: input.processingConfiguration,
			},
		);

		try {
			await startMarkerProcessing(sourceDocumentId);
			return c.json({ sourceDocumentId, processingStarted: true }, 201);
		} catch (startError) {
			await failProcessing(sourceDocumentId, errorMessage(startError));
			return c.json(
				{
					sourceDocumentId,
					processingStarted: false,
					error: errorMessage(startError),
				},
				202,
			);
		}
	} catch (error) {
		return c.json({ error: errorMessage(error) }, 400);
	}
});

sourceDocumentsRoute.post("/:sourceDocumentId/marker-result", async (c) => {
	const sourceDocumentId = c.req.param(
		"sourceDocumentId",
	) as Id<"sourceDocuments">;

	let isValidatedCallback = false;

	try {
		const input = v.parse(markerResultSchema, await c.req.json());
		const metadata = await getValidatedIngestMetadata({
			sourceDocumentId,
			ingestToken: input.ingestToken,
		});
		isValidatedCallback = true;

		if (metadata.processingStatus !== "processing") {
			return c.json({ ignored: true });
		}

		if (input.error) {
			await failProcessing(sourceDocumentId, input.error);
			return c.json({ failed: true });
		}
		if (input.result === undefined) {
			throw new Error("Marker result callback is missing result");
		}

		const result = normalizeMarkerConversionResult(input.result);
		const imageUrls = await saveMarkerImages(
			sourceDocumentId,
			collectMarkerImages(result),
		);
		const adapted = adaptMarkerConversionResult({ result, imageUrls });
		const serviceSecret = readApiToConvexServiceSecret();
		const client = createConvexHttpClient();
		const pageReplace = await client.mutation(
			api.api.pages.replaceForSourceDocumentFromApi,
			{
				serviceSecret,
				sourceDocumentId,
				pages: adapted.pages,
			},
		);

		if (pageReplace.ignored) return c.json({ ignored: true });

		for (let i = 0; i < adapted.blocks.length; i += BLOCK_INSERT_BATCH_SIZE) {
			const batch = adapted.blocks.slice(i, i + BLOCK_INSERT_BATCH_SIZE);
			const inserted = await client.mutation(
				api.api.blocks.insertForSourceDocumentFromApi,
				{
					serviceSecret,
					sourceDocumentId,
					blocks: batch,
				},
			);
			if (inserted.ignored) return c.json({ ignored: true });
		}

		if (adapted.warnings.length) {
			await appendProcessingEvent(sourceDocumentId, {
				type: "conversion.warning",
				emitter: "app",
				severity: "warning",
				message: "Marker conversion completed with warnings.",
				emittedAt: Date.now(),
				data: { warnings: adapted.warnings },
			});
		}

		const status = adapted.warnings.length ? "readyWithWarnings" : "ready";
		await client.mutation(api.api.sourceDocuments.finishProcessingFromApi, {
			serviceSecret,
			sourceDocumentId,
			status,
			pageCount: adapted.pages.length,
		});
		await appendProcessingEvent(sourceDocumentId, {
			type: "conversion.completed",
			emitter: "app",
			severity: "info",
			message: "Marker conversion completed and Pages/Blocks were persisted.",
			emittedAt: Date.now(),
			data: {
				status,
				pageCount: adapted.pages.length,
				blockCount: adapted.blocks.length,
				imageCount: Object.keys(imageUrls).length,
				warningCount: adapted.warnings.length,
			},
		});

		return c.json({ status });
	} catch (error) {
		if (isValidatedCallback) {
			await failProcessing(sourceDocumentId, errorMessage(error)).catch(
				() => undefined,
			);
		}
		return c.json({ error: errorMessage(error) }, 400);
	}
});

sourceDocumentsRoute.get("/:sourceDocumentId/images/:filename", async (c) => {
	const authToken = bearerToken(c.req.header("Authorization"));
	if (!authToken) return c.json({ error: "Unauthenticated" }, 401);

	const sourceDocumentId = c.req.param(
		"sourceDocumentId",
	) as Id<"sourceDocuments">;
	const filename = c.req.param("filename");

	try {
		await createConvexHttpClient(authToken).query(api.api.sourceDocuments.get, {
			sourceDocumentId,
		});
		const image = await readObject(
			sourceDocumentImageObjectKey(sourceDocumentId, filename),
		);
		return c.body(image, 200, {
			"Content-Type": imageContentType(filename),
			"Cache-Control": "private, max-age=31536000, immutable",
		});
	} catch {
		return c.json({ error: "Image not found" }, 404);
	}
});

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

async function failProcessing(
	sourceDocumentId: Id<"sourceDocuments">,
	message: string,
) {
	const serviceSecret = readApiToConvexServiceSecret();
	const client = createConvexHttpClient();
	const failed = await client.mutation(
		api.api.sourceDocuments.markProcessingFailedFromApi,
		{
			serviceSecret,
			sourceDocumentId,
		},
	);
	if (failed.ignored) return;

	await appendProcessingEvent(sourceDocumentId, {
		type: "conversion.failed",
		emitter: "app",
		severity: "error",
		message,
		emittedAt: Date.now(),
	});
}

async function appendProcessingEvent(
	sourceDocumentId: Id<"sourceDocuments">,
	event: ProcessingEventInput,
) {
	const serviceSecret = readApiToConvexServiceSecret();
	const insertedEvent = await createConvexHttpClient().mutation(
		api.api.processingEvents.appendFromApi,
		{
			serviceSecret,
			sourceDocumentId,
			event,
		},
	);
	publishProcessingEvent(insertedEvent);
}

function bearerToken(authorizationHeader: string | undefined) {
	const prefix = "Bearer ";

	if (!authorizationHeader?.startsWith(prefix)) {
		return null;
	}

	return authorizationHeader.slice(prefix.length).trim() || null;
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
