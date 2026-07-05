import type { Id } from "@academic-reader/convex/data-model";
import { runEquationExplanationsForDocument } from "./equation-explanations";
import {
	createNarrationGenerationRun,
	type NarrationRunResult,
} from "./narration";
import { runNarrationEligibilityForDocument } from "./narration-eligibility";
import { getNarrationProcessingInput } from "./narration-persistence";

export type PostConversionProcessingResult = {
	equationExplanations?: Awaited<
		ReturnType<typeof runEquationExplanationsForDocument>
	>;
	narration?: NarrationRunResult;
};

export function startPostConversionProcessingInBackground(
	documentId: Id<"documents">,
) {
	queueMicrotask(() => {
		void runPostConversionProcessingForDocument({ documentId }).catch(
			() => undefined,
		);
	});
}

export async function runPostConversionProcessingForDocument(input: {
	documentId: Id<"documents">;
}): Promise<PostConversionProcessingResult> {
	const metadata = await getNarrationProcessingInput(input.documentId);
	const result: PostConversionProcessingResult = {};
	const narration = metadata.processingConfiguration.narration.enabled
		? createNarrationGenerationRun({ documentId: input.documentId })
		: undefined;
	const equationExplanations = metadata.processingConfiguration
		.equationExplanations.enabled
		? runEquationExplanationsForDocument({
				documentId: input.documentId,
				onEquationExplanationPersisted:
					narration?.onEquationExplanationPersisted,
			})
		: undefined;
	if (equationExplanations && narration) {
		void equationExplanations.then(
			() => narration.closeEquationExplanations(),
			() => narration.closeEquationExplanations(),
		);
	} else {
		narration?.closeEquationExplanations();
	}

	if (metadata.processingConfiguration.narration.enabled) {
		const eligibility = await runNarrationEligibilityForDocument({
			documentId: input.documentId,
		});
		if (eligibility.status !== "completed") {
			result.narration = eligibility;
			narration?.closeEquationExplanations();
		} else if (eligibility.eligibleCount === 0) {
			result.narration = { status: "skipped", reason: "no-eligible-blocks" };
			narration?.closeEquationExplanations();
		} else if (narration) {
			result.narration = await narration.run();
			if (equationExplanations) {
				result.equationExplanations = await equationExplanations;
			}
			return result;
		}
	}

	if (equationExplanations) {
		result.equationExplanations = await equationExplanations;
	}

	return result;
}
