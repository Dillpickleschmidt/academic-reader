import type { Id } from "@academic-reader/convex/data-model";
import {
	processingEventEmitters,
	processingEventSeverities,
	processingEventTypes,
} from "@academic-reader/shared/processing-events";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import * as v from "valibot";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "../convex";
import {
	publishProcessingEvent,
	subscribeToProcessingEvents,
	type ProcessingEventMessage,
} from "../processing-event-broker";
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

		const event = await client.mutation(
			api.api.processingEvents.appendFromApi,
			{
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
			},
		);

		publishProcessingEvent(event);

		return c.json(event);
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

processingEventsRoute.get("/stream/:documentId", async (c) => {
	const documentId = c.req.param("documentId") as Id<"documents">;
	const authToken = bearerToken(c.req.header("Authorization"));

	if (!authToken) {
		return c.json({ error: "Unauthenticated" }, 401);
	}

	try {
		await createConvexHttpClient(authToken).query(
			api.api.processingEvents.authorizeStream,
			{ documentId },
		);
	} catch {
		return c.json({ error: "Document not found" }, 404);
	}

	return streamSSE(c, async (stream) => {
		const queue: ProcessingEventMessage[] = [];
		let resolveNext:
			| ((event: ProcessingEventMessage | null) => void)
			| undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		function cleanupPendingWait() {
			if (timeout) clearTimeout(timeout);
			timeout = undefined;
			const resolve = resolveNext;
			resolveNext = undefined;
			resolve?.(null);
		}

		function notify(event: ProcessingEventMessage) {
			if (!resolveNext) {
				queue.push(event);
				return;
			}

			if (timeout) clearTimeout(timeout);
			timeout = undefined;
			const resolve = resolveNext;
			resolveNext = undefined;
			resolve(event);
		}

		function nextEvent() {
			const queuedEvent = queue.shift();
			if (queuedEvent) return Promise.resolve(queuedEvent);

			return new Promise<ProcessingEventMessage | null>((resolve) => {
				resolveNext = resolve;
				timeout = setTimeout(() => {
					resolveNext = undefined;
					timeout = undefined;
					resolve(null);
				}, 25_000);
			});
		}

		const unsubscribe = subscribeToProcessingEvents(documentId, notify);
		stream.onAbort(() => {
			unsubscribe();
			cleanupPendingWait();
		});

		try {
			await stream.writeSSE({ event: "connected", data: "{}" });

			while (!stream.aborted && !stream.closed) {
				const event = await nextEvent();
				if (stream.aborted || stream.closed) break;

				if (!event) {
					await stream.writeSSE({ event: "heartbeat", data: "{}" });
					continue;
				}

				await stream.writeSSE({
					event: "processing-event",
					id: event._id,
					data: JSON.stringify(event),
				});
			}
		} finally {
			unsubscribe();
			cleanupPendingWait();
		}
	});
});

function bearerToken(authorizationHeader: string | undefined) {
	const prefix = "Bearer ";

	if (!authorizationHeader?.startsWith(prefix)) {
		return null;
	}

	return authorizationHeader.slice(prefix.length).trim() || null;
}
