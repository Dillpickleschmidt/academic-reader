import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { processingEventInputValidator } from "../processingEventValidators";
import * as ProcessingEvents from "../model/processingEvents";

export const listForSourceDocument = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		ProcessingEvents.listProcessingEventsForSourceDocument(
			ctx,
			args.sourceDocumentId,
		),
});

export const authorizeStream = query({
	args: {
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		ProcessingEvents.authorizeProcessingEventStream(ctx, args.sourceDocumentId),
});

export const getIngestMetadata = query({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
	},
	handler: (ctx, args) =>
		ProcessingEvents.getProcessingEventIngestMetadata(ctx, args),
});

export const appendFromApi = mutation({
	args: {
		serviceSecret: v.string(),
		sourceDocumentId: v.id("sourceDocuments"),
		event: processingEventInputValidator,
	},
	handler: (ctx, args) =>
		ProcessingEvents.appendProcessingEventFromApi(ctx, args),
});
