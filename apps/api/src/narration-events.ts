import type { Id } from "@academic-reader/convex/data-model";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";

export async function appendNarrationEvent(
	documentId: Id<"documents">,
	event: ProcessingEventInput,
) {
	await createConvexHttpClient().mutation(
		api.api.processingEvents.appendFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
			event,
		},
	);
}
