import type { Id } from "@academic-reader/convex/data-model";
import { conversionModels } from "@academic-reader/shared/processing";
import {
	sourceDocumentMaxSizeBytes,
	sourceDocumentMimeTypes,
} from "@academic-reader/shared/uploads";
import { Hono } from "hono";
import * as v from "valibot";
import {
	acceptMarkerResult,
	createSourceDocumentAndStartProcessing,
	createSourceDocumentImageAccess,
	createSourceDocumentSourceAccess,
} from "../source-documents";

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

const imageUrlsSchema = v.object({
	filenames: v.array(v.pipe(v.string(), v.minLength(1))),
});

export const sourceDocumentsRoute = new Hono();

sourceDocumentsRoute.post("/", async (c) => {
	const authToken = bearerToken(c.req.header("Authorization"));
	if (!authToken) return c.json({ error: "Unauthenticated" }, 401);

	try {
		const input = v.parse(createSourceDocumentSchema, await c.req.json());
		const result = await createSourceDocumentAndStartProcessing({
			authToken,
			...input,
		});

		return c.json(result, result.processingStarted ? 201 : 202);
	} catch (error) {
		return c.json({ error: errorMessage(error) }, 400);
	}
});

sourceDocumentsRoute.post("/:sourceDocumentId/marker-result", async (c) => {
	const sourceDocumentId = c.req.param(
		"sourceDocumentId",
	) as Id<"sourceDocuments">;

	try {
		const input = v.parse(markerResultSchema, await c.req.json());
		return c.json(
			await acceptMarkerResult({
				sourceDocumentId,
				ingestToken: input.ingestToken,
				result: input.result,
				error: input.error,
			}),
		);
	} catch (error) {
		return c.json({ error: errorMessage(error) }, 400);
	}
});

sourceDocumentsRoute.get("/:sourceDocumentId/source-url", async (c) => {
	const authToken = bearerToken(c.req.header("Authorization"));
	if (!authToken) return c.json({ error: "Unauthenticated" }, 401);

	try {
		return c.json(
			await createSourceDocumentSourceAccess({
				authToken,
				sourceDocumentId: c.req.param(
					"sourceDocumentId",
				) as Id<"sourceDocuments">,
			}),
		);
	} catch {
		return c.json({ error: "Source Document not found" }, 404);
	}
});

sourceDocumentsRoute.post("/:sourceDocumentId/image-urls", async (c) => {
	const authToken = bearerToken(c.req.header("Authorization"));
	if (!authToken) return c.json({ error: "Unauthenticated" }, 401);

	try {
		const input = v.parse(imageUrlsSchema, await c.req.json());
		if (input.filenames.length > 500) {
			return c.json({ error: "Too many images requested" }, 400);
		}

		return c.json(
			await createSourceDocumentImageAccess({
				authToken,
				sourceDocumentId: c.req.param(
					"sourceDocumentId",
				) as Id<"sourceDocuments">,
				filenames: input.filenames,
			}),
		);
	} catch (error) {
		return c.json({ error: errorMessage(error) }, 400);
	}
});

function bearerToken(authorizationHeader: string | undefined) {
	const prefix = "Bearer ";

	if (!authorizationHeader?.startsWith(prefix)) {
		return null;
	}

	return authorizationHeader.slice(prefix.length).trim() || null;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
