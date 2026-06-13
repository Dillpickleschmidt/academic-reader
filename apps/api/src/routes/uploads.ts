import {
	sourceDocumentMaxSizeBytes,
	sourceDocumentMimeTypes,
} from "@academic-reader/shared/uploads";
import { Hono } from "hono";
import * as v from "valibot";
import { createTemporaryUpload } from "../storage";

const temporaryUploadSchema = v.object({
	filename: v.pipe(v.string(), v.minLength(1)),
	mimeType: v.picklist(sourceDocumentMimeTypes),
	sizeBytes: v.pipe(
		v.number(),
		v.minValue(1),
		v.maxValue(sourceDocumentMaxSizeBytes),
	),
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
