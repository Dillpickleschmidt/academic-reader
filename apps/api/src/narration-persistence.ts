import type { Id } from "@academic-reader/convex/data-model";
import type { BlockNarration } from "@academic-reader/shared/narration";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";

export function getNarrationProcessingInput(documentId: Id<"documents">) {
	return createConvexHttpClient().query(
		api.api.documents.getProcessingInputForApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
		},
	);
}

export function listNarrationBlocks(documentId: Id<"documents">) {
	return createConvexHttpClient().query(api.api.blocks.listForDocumentFromApi, {
		serviceSecret: readApiToConvexServiceSecret(),
		documentId,
	});
}

export async function setNarrationGuide(
	documentId: Id<"documents">,
	narrationGuide: string,
) {
	await createConvexHttpClient().mutation(
		api.api.documents.setNarrationGuideFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
			narrationGuide,
		},
	);
}

export async function patchNarrationDecisions(
	documentId: Id<"documents">,
	narrations: Array<{
		blockId: string;
		narration: BlockNarration;
	}>,
	phase: "candidates" | "eligibility",
) {
	if (!narrations.length) return { patchedCount: 0, missingBlockIds: [] };

	const result = await createConvexHttpClient().mutation(
		api.api.blocks.patchNarrationsFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
			narrations,
		},
	);

	if (result.missingBlockIds.length) {
		await appendNarrationEvent(documentId, {
			type: `narration.${phase}.warning`,
			emitter: "app",
			severity: "warning",
			message: "Some Blocks were missing while patching Narration Eligibility.",
			emittedAt: Date.now(),
			data: { missingBlockIds: result.missingBlockIds },
		});
	}

	return result;
}

export async function patchNarrationTexts(
	documentId: Id<"documents">,
	texts: Array<{
		blockId: string;
		text: string;
	}>,
) {
	if (!texts.length) {
		return {
			patchedCount: 0,
			missingBlockIds: [],
			ineligibleBlockIds: [],
		};
	}

	const result = await createConvexHttpClient().mutation(
		api.api.blocks.patchNarrationTextsFromApi,
		{
			serviceSecret: readApiToConvexServiceSecret(),
			documentId,
			texts,
		},
	);

	if (result.missingBlockIds.length || result.ineligibleBlockIds.length) {
		await appendNarrationEvent(documentId, {
			type: "narration.rewrite.warning",
			emitter: "app",
			severity: "warning",
			message: "Some Blocks were skipped while patching Narration Text.",
			emittedAt: Date.now(),
			data: {
				missingBlockIds: result.missingBlockIds,
				ineligibleBlockIds: result.ineligibleBlockIds,
			},
		});
	}

	return result;
}

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
