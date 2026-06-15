import type { Id } from "@academic-reader/convex/data-model";
import {
	type EligibilityReviewBatch,
	runNarrationEligibilityForDocument,
} from "./narration-eligibility";
import {
	type NarrationGuideGenerator,
	type NarrationRewriteBatch,
	runNarrationPreparationForDocument,
} from "./narration-preparation";

export type NarrationRunResult =
	| { status: "completed" }
	| {
			status: "failed";
			phase: "candidates" | "eligibility" | "guide" | "rewrite";
			error: string;
	  }
	| { status: "skipped"; reason: "narration-disabled" | "no-eligible-blocks" };

export function startNarrationInBackground(documentId: Id<"documents">) {
	queueMicrotask(() => {
		void runNarrationForDocument({ documentId }).catch(() => undefined);
	});
}

export async function runNarrationForDocument(input: {
	documentId: Id<"documents">;
	reviewBatch?: EligibilityReviewBatch;
	generateGuide?: NarrationGuideGenerator;
	rewriteBatch?: NarrationRewriteBatch;
}): Promise<NarrationRunResult> {
	const eligibility = await runNarrationEligibilityForDocument({
		documentId: input.documentId,
		reviewBatch: input.reviewBatch,
	});

	if (eligibility.status !== "completed") return eligibility;
	if (eligibility.eligibleCount === 0) {
		return { status: "skipped", reason: "no-eligible-blocks" };
	}

	const preparation = await runNarrationPreparationForDocument({
		documentId: input.documentId,
		generateGuide: input.generateGuide,
		rewriteBatch: input.rewriteBatch,
	});

	if (preparation.status !== "completed") return preparation;

	return { status: "completed" };
}
