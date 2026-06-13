import {
	sourceDocumentMaxSizeBytes,
	sourceDocumentMimeTypes,
} from "@academic-reader/shared/uploads";
import { Hono } from "hono";
import * as v from "valibot";
import { createTemporaryUpload, promoteTemporaryUpload } from "../storage";

const temporaryUploadSchema = v.object({
	filename: v.pipe(v.string(), v.minLength(1)),
	mimeType: v.picklist(sourceDocumentMimeTypes),
	sizeBytes: v.pipe(
		v.number(),
		v.minValue(1),
		v.maxValue(sourceDocumentMaxSizeBytes),
	),
});

const promoteUploadSchema = v.object({
	temporaryUploadId: v.pipe(v.string(), v.minLength(1)),
	filename: v.pipe(v.string(), v.minLength(1)),
});

export const uploadsRoute = new Hono();

uploadsRoute.post("/temporary", async (c) => {
	try {
		const input = v.parse(temporaryUploadSchema, await c.req.json());
		return c.json(await createTemporaryUpload(input));
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not create temporary upload",
			},
			400,
		);
	}
});

uploadsRoute.post("/promote", async (c) => {
	try {
		const input = v.parse(promoteUploadSchema, await c.req.json());
		return c.json(await promoteTemporaryUpload(input));
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not promote temporary upload",
			},
			400,
		);
	}
});
