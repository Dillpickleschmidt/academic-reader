import type { Id } from "@academic-reader/convex/data-model";
import type { PersistedEquationExplanation } from "./equation-explanations";
import { createNarrationAudioQueue } from "./narration-audio";
import {
	type EligibilityReviewBatch,
	runNarrationEligibilityForDocument,
} from "./narration-eligibility";
import { getNarrationProcessingInput } from "./narration-persistence";
import {
	type NarrationGuideGenerator,
	type NarrationRewriteBatch,
	runNarrationPreparationForDocument,
} from "./narration-preparation";

export type NarrationRunResult =
	| { status: "completed" }
	| {
			status: "failed";
			phase: "candidates" | "eligibility" | "guide" | "rewrite" | "audio";
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

	return runNarrationAfterEligibilityForDocument(input);
}

export function createNarrationGenerationRun(input: {
	documentId: Id<"documents">;
	generateGuide?: NarrationGuideGenerator;
	rewriteBatch?: NarrationRewriteBatch;
}) {
	const equationExplanations = createAsyncQueue<PersistedEquationExplanation>();
	let closedEquationExplanations = false;

	function onEquationExplanationPersisted(
		explanation: PersistedEquationExplanation,
	) {
		equationExplanations.push(explanation);
	}

	function closeEquationExplanations() {
		if (closedEquationExplanations) return;
		closedEquationExplanations = true;
		equationExplanations.close();
	}

	async function run(): Promise<NarrationRunResult> {
		const metadata = await getNarrationProcessingInput(input.documentId);
		const audioQueue = createNarrationAudioQueue({
			documentId: input.documentId,
			voice: metadata.processingConfiguration.narration.voice,
		});
		const preparation = await runNarrationPreparationForDocument({
			documentId: input.documentId,
			generateGuide: input.generateGuide,
			rewriteBatch: input.rewriteBatch,
			equationExplanations,
			onNarrationTextsPersisted: audioQueue.enqueue,
		});
		const audio = await audioQueue.closeAndDrain();

		if (preparation.status !== "completed") return preparation;
		if (audio.status !== "completed") return audio;

		return { status: "completed" };
	}

	return { onEquationExplanationPersisted, closeEquationExplanations, run };
}

export async function runNarrationAfterEligibilityForDocument(input: {
	documentId: Id<"documents">;
	generateGuide?: NarrationGuideGenerator;
	rewriteBatch?: NarrationRewriteBatch;
}): Promise<NarrationRunResult> {
	const narration = createNarrationGenerationRun(input);
	narration.closeEquationExplanations();
	return narration.run();
}

function createAsyncQueue<T>() {
	const values: T[] = [];
	const waiters: Array<() => void> = [];
	let closed = false;

	function push(value: T) {
		if (closed) return;
		values.push(value);
		signal();
	}

	function close() {
		closed = true;
		signal();
	}

	async function* iterate() {
		while (true) {
			const value = values.shift();
			if (value !== undefined) {
				yield value;
				continue;
			}
			if (closed) return;
			await wait();
		}
	}

	function wait() {
		return new Promise<void>((resolve) => {
			waiters.push(resolve);
		});
	}

	function signal() {
		for (const waiter of waiters.splice(0)) waiter();
	}

	return {
		push,
		close,
		[Symbol.asyncIterator]: iterate,
	};
}
