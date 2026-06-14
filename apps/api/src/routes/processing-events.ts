import type { Id } from "@academic-reader/convex/data-model";
import {
	processingEventEmitters,
	processingEventSeverities,
	processingEventTypes,
} from "@academic-reader/shared/processing-events";
import { Hono } from "hono";
import * as v from "valibot";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "../convex";
import {
	createProcessingEventIngestToken,
	isMatchingProcessingEventIngestToken,
} from "../processing-event-ingest-token";

const processingEventProgressSchema = v.object({
	current: v.optional(v.number()),
	total: v.optional(v.number()),
	percent: v.optional(v.number()),
	label: v.optional(v.string()),
});

const processingEventIngestSchema = v.object({
	documentId: v.pipe(v.string(), v.minLength(1)),
	ingestToken: v.pipe(v.string(), v.minLength(1)),
	type: v.picklist(processingEventTypes),
	emitter: v.picklist(processingEventEmitters),
	severity: v.picklist(processingEventSeverities),
	message: v.pipe(v.string(), v.minLength(1)),
	emittedAt: v.number(),
	pageNumber: v.optional(v.number()),
	blockId: v.optional(v.string()),
	progress: v.optional(processingEventProgressSchema),
	data: v.optional(v.record(v.string(), v.any())),
});

export const processingEventsRoute = new Hono();

processingEventsRoute.post("/ingest", async (c) => {
	try {
		const input = v.parse(processingEventIngestSchema, await c.req.json());
		const serviceSecret = readApiToConvexServiceSecret();
		const documentId = input.documentId as Id<"documents">;
		const client = createConvexHttpClient();
		const ingestMetadata = await client.query(
			api.api.processingEvents.getIngestMetadata,
			{
				serviceSecret,
				documentId,
			},
		);
		const expectedToken = createProcessingEventIngestToken({
			serviceSecret,
			documentId: ingestMetadata.documentId,
			processingRunStartedAt: ingestMetadata.processingRunStartedAt,
		});

		if (
			!isMatchingProcessingEventIngestToken({
				actualToken: input.ingestToken,
				expectedToken,
			})
		) {
			return c.json({ error: "Unauthenticated" }, 401);
		}

		await client.mutation(api.api.processingEvents.appendFromApi, {
			serviceSecret,
			documentId,
			event: {
				type: input.type,
				emitter: input.emitter,
				severity: input.severity,
				message: input.message,
				emittedAt: input.emittedAt,
				...(input.pageNumber !== undefined
					? { pageNumber: input.pageNumber }
					: {}),
				...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
				...(input.progress !== undefined ? { progress: input.progress } : {}),
				...(input.data !== undefined ? { data: input.data } : {}),
			},
		});

		return c.json({ ok: true });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not ingest Processing Event",
			},
			400,
		);
	}
});
