import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import * as ProcessingEvents from "../model/processingEvents";
import { processingEventInputValidator } from "../processingEventValidators";

export const listForDocument = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: (ctx, args) =>
		ProcessingEvents.listProcessingEventsForDocument(ctx, args.documentId),
});

export const getIngestMetadata = query({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
	},
	handler: (ctx, args) =>
		ProcessingEvents.getProcessingEventIngestMetadata(ctx, args),
});

export const appendFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		documentId: v.id("documents"),
		event: processingEventInputValidator,
	},
	returns: v.object({ ok: v.literal(true) }),
	handler: (ctx, args) =>
		ProcessingEvents.appendProcessingEventFromApi(ctx, args),
});
