import type { Id } from "@academic-reader/convex/data-model";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";

export function getEquationExplanationProcessingInput(
	documentId: Id<"documents">,
) {
	return createConvexHttpClient().query(
		api.api.documents.getProcessingInputForApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
		},
	);
}

export function listEquationExplanationBlocks(documentId: Id<"documents">) {
	return createConvexHttpClient().query(api.api.blocks.listForDocumentFromApi, {
		serviceSecret: readApiToConvexServiceSecret(),
		documentId,
	});
}

export async function patchEquationExplanation(
	documentId: Id<"documents">,
	input: {
		blockId: string;
		contentHtml: string;
		model: string;
		generatedAt: number;
	},
) {
	await createConvexHttpClient().mutation(
		api.api.blocks.patchEquationExplanationFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
			blockId: input.blockId,
			equationExplanation: {
				contentHtml: input.contentHtml,
				model: input.model,
				generatedAt: input.generatedAt,
			},
		},
	);
}

export async function appendEquationExplanationEvent(
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
