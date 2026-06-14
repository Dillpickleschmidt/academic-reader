import type { Id } from "@academic-reader/convex/data-model";
import {
	type BlockNarration,
	type NarrationPreparation,
	narrationPreparations,
	type SoftIneligibleNarrationReason,
	softIneligibleNarrationReasons,
} from "@academic-reader/shared/narration";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import { generateText } from "ai";
import { AiConfigurationError, narrationEligibilityModel } from "./ai";
import {
	api,
	createConvexHttpClient,
	readApiToConvexServiceSecret,
} from "./convex";
import {
	deriveNarrationCandidate,
	type NarrationCandidateFeatures,
} from "./narration-candidates";

export interface NarrationEligibilityCandidate {
	blockId: string;
	candidateText: string;
	features: NarrationCandidateFeatures;
}

export interface EligibilityReviewOutput {
	blocks: EligibilityReviewOutputBlock[];
}

export interface EligibilityReviewOutputBlock {
	blockId: string;
	decision: "eligible" | "ineligible";
	preparation?: string[];
	reason?: string;
}

export type EligibilityReviewBatch = (
	candidates: NarrationEligibilityCandidate[],
) => Promise<EligibilityReviewOutput>;

export interface NarrationDecisionPatch {
	blockId: string;
	narration: BlockNarration;
}

export class EligibilityReviewOutputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EligibilityReviewOutputError";
	}
}

const eligibilityBatchSize = 20;
const maxOutputTokens = 8192;
const preparationSet = new Set<string>(narrationPreparations);
const softReasonSet = new Set<string>(softIneligibleNarrationReasons);

const systemPrompt = `You are performing Narration Eligibility Review for Academic Reader.

You receive Blocks as small HTML fragments. Each input item has only:
- blockId
- candidateText

You do not receive Block Type, raw Block Type, page context, nearby headings, or a document-specific Narration Guide. Decide from candidateText alone.

Return whether each Block should contribute to spoken Narration for a reader. Include substantive document content: body prose, headings that help orientation, abstracts, explanations, methodology, results, discussion, conclusions, meaningful captions, list items, and standalone equations. Exclude noise: document metadata, reference entries, bibliography headings, table-of-contents entries, and unknown extraction noise.

Eligible Blocks must include Narration Preparation tags:
- plain: text can be converted to speech by basic cleanup only.
- inline-citation-cleanup: citations should be smoothed or omitted later. Required when candidateText contains <span class="inline-citation">.
- inline-math: inline mathematical notation needs spoken-form rewriting.
- equation-explanation: a standalone or display equation should be naturally explained.

Rules:
- Use exactly one output object for every input blockId.
- Never invent, rename, omit, or duplicate blockIds.
- For eligible Blocks, preparation must be a non-empty array.
- plain is mutually exclusive with every other preparation tag.
- If candidateText contains inline-citation spans, do not use plain; include inline-citation-cleanup.
- The LLM may assign inline-citation-cleanup for unmarked citation-like text.
- Inline math should use inline-math.
- Standalone/display equations should be eligible with equation-explanation.
- For ineligible Blocks, use one reason: document-metadata, reference-entry, bibliography-heading, table-of-contents, or unknown-noise.

Return JSON only in this exact shape:
{
  "blocks": [
    {
      "blockId": "input block id",
      "decision": "eligible",
      "preparation": ["plain"]
    },
    {
      "blockId": "another input block id",
      "decision": "ineligible",
      "reason": "reference-entry"
    }
  ]
}`;

export function startNarrationEligibilityInBackground(
	documentId: Id<"documents">,
) {
	queueMicrotask(() => {
		void runNarrationEligibilityForDocument({ documentId }).catch(
			() => undefined,
		);
	});
}

export async function runNarrationEligibilityForDocument(input: {
	documentId: Id<"documents">;
	reviewBatch?: EligibilityReviewBatch;
}) {
	const serviceSecret = readApiToConvexServiceSecret();
	const client = createConvexHttpClient();
	const metadata = await client.query(
		api.api.documents.getProcessingInputForApi,
		{
			serviceSecret,
			documentId: input.documentId,
		},
	);

	if (!metadata.processingConfiguration.narration.enabled) return;

	const candidates: NarrationEligibilityCandidate[] = [];
	let hardExcludedCount = 0;

	try {
		const blocks = await client.query(api.api.blocks.listForDocumentFromApi, {
			serviceSecret,
			documentId: input.documentId,
		});
		const unreviewedBlocks = blocks.filter(
			(block) => block.narration === undefined,
		);

		await appendNarrationEvent(input.documentId, {
			type: "narration.candidates.started",
			emitter: "app",
			severity: "info",
			message: "Narration Candidate extraction started.",
			emittedAt: Date.now(),
			progress: { current: 0, total: unreviewedBlocks.length, percent: 0 },
		});

		const hardExclusions: NarrationDecisionPatch[] = [];
		for (const block of unreviewedBlocks) {
			const result = deriveNarrationCandidate(block);
			if (result.kind === "hard-excluded") {
				hardExclusions.push({
					blockId: result.blockId,
					narration: result.narration,
				});
			} else {
				candidates.push(result);
			}
		}

		if (hardExclusions.length) {
			await patchNarrations(input.documentId, hardExclusions, "candidates");
		}
		hardExcludedCount = hardExclusions.length;

		await appendNarrationEvent(input.documentId, {
			type: "narration.candidates.completed",
			emitter: "app",
			severity: "info",
			message: "Narration Candidate extraction completed.",
			emittedAt: Date.now(),
			progress: {
				current: unreviewedBlocks.length,
				total: unreviewedBlocks.length,
				percent: 100,
			},
			data: {
				candidateCount: candidates.length,
				hardExcludedCount,
			},
		});
	} catch (error) {
		await appendNarrationEvent(input.documentId, {
			type: "narration.candidates.failed",
			emitter: "app",
			severity: "error",
			message: errorMessage(error),
			emittedAt: Date.now(),
		});
		return;
	}

	try {
		if (!candidates.length) {
			await appendNarrationEvent(input.documentId, {
				type: "narration.eligibility.completed",
				emitter: "app",
				severity: "info",
				message: "Narration Eligibility Review completed with no candidates.",
				emittedAt: Date.now(),
				progress: { current: 0, total: 0, percent: 100 },
				data: { eligibleCount: 0, ineligibleCount: hardExcludedCount },
			});
			return;
		}

		let reviewBatch = input.reviewBatch;
		if (!reviewBatch) {
			try {
				reviewBatch = createGroqEligibilityReview();
			} catch (error) {
				if (error instanceof AiConfigurationError) {
					await appendNarrationEvent(input.documentId, {
						type: "narration.eligibility.failed",
						emitter: "app",
						severity: "error",
						message: error.message,
						emittedAt: Date.now(),
						data: { phase: "configuration" },
					});
					return;
				}
				throw error;
			}
		}

		await appendNarrationEvent(input.documentId, {
			type: "narration.eligibility.started",
			emitter: "app",
			severity: "info",
			message: "Narration Eligibility Review started.",
			emittedAt: Date.now(),
			progress: { current: 0, total: candidates.length, percent: 0 },
			data: { batchSize: eligibilityBatchSize },
		});

		let eligibleCount = 0;
		let ineligibleCount = hardExcludedCount;
		await reviewEligibilityCandidates({
			candidates,
			reviewBatch,
			onDecisions: async (decisions, progress) => {
				await patchNarrations(input.documentId, decisions, "eligibility");
				for (const decision of decisions) {
					if (decision.narration.decision === "eligible") eligibleCount += 1;
					else ineligibleCount += 1;
				}
				await appendNarrationEvent(input.documentId, {
					type: "narration.eligibility.progress",
					emitter: "app",
					severity: "info",
					message: "Narration Eligibility Review batch completed.",
					emittedAt: Date.now(),
					progress: {
						current: progress.reviewedCount,
						total: candidates.length,
						percent: Math.round(
							(progress.reviewedCount / candidates.length) * 100,
						),
						label: `Batch ${progress.batchIndex + 1}/${progress.batchCount}`,
					},
					data: {
						batchIndex: progress.batchIndex,
						batchCount: progress.batchCount,
						decisionCount: decisions.length,
					},
				});
			},
		});

		await appendNarrationEvent(input.documentId, {
			type: "narration.eligibility.completed",
			emitter: "app",
			severity: "info",
			message: "Narration Eligibility Review completed.",
			emittedAt: Date.now(),
			progress: {
				current: candidates.length,
				total: candidates.length,
				percent: 100,
			},
			data: { eligibleCount, ineligibleCount },
		});
	} catch (error) {
		await appendNarrationEvent(input.documentId, {
			type: "narration.eligibility.failed",
			emitter: "app",
			severity: "error",
			message: errorMessage(error),
			emittedAt: Date.now(),
		});
	}
}

export async function reviewEligibilityCandidates(input: {
	candidates: NarrationEligibilityCandidate[];
	reviewBatch: EligibilityReviewBatch;
	batchSize?: number;
	onDecisions?: (
		decisions: NarrationDecisionPatch[],
		progress: {
			batchIndex: number;
			batchCount: number;
			reviewedCount: number;
		},
	) => Promise<void> | void;
}) {
	const batchSize = input.batchSize ?? eligibilityBatchSize;
	const batches = chunk(input.candidates, batchSize);
	const decisions: NarrationDecisionPatch[] = [];
	let reviewedCount = 0;

	for (const [batchIndex, batch] of batches.entries()) {
		const batchDecisions = await reviewEligibilityBatchWithRetry({
			batch,
			reviewBatch: input.reviewBatch,
		});
		decisions.push(...batchDecisions);
		reviewedCount += batch.length;
		await input.onDecisions?.(batchDecisions, {
			batchIndex,
			batchCount: batches.length,
			reviewedCount,
		});
	}

	return decisions;
}

export function validateEligibilityReviewOutput(
	candidates: NarrationEligibilityCandidate[],
	output: unknown,
): NarrationDecisionPatch[] {
	if (!isRecord(output) || !Array.isArray(output.blocks)) {
		throw new EligibilityReviewOutputError(
			"Narration Eligibility Review output must include a blocks array",
		);
	}

	const candidateById = new Map(
		candidates.map((candidate) => [candidate.blockId, candidate]),
	);
	const seenIds = new Set<string>();
	const decisions: NarrationDecisionPatch[] = [];

	for (const rawBlock of output.blocks) {
		if (!isRecord(rawBlock) || typeof rawBlock.blockId !== "string") {
			throw new EligibilityReviewOutputError(
				"Narration Eligibility Review output block is invalid",
			);
		}
		const candidate = candidateById.get(rawBlock.blockId);
		if (!candidate) {
			throw new EligibilityReviewOutputError(
				`Narration Eligibility Review returned unknown blockId ${rawBlock.blockId}`,
			);
		}
		if (seenIds.has(rawBlock.blockId)) {
			throw new EligibilityReviewOutputError(
				`Narration Eligibility Review duplicated blockId ${rawBlock.blockId}`,
			);
		}
		seenIds.add(rawBlock.blockId);

		decisions.push({
			blockId: rawBlock.blockId,
			narration: blockNarrationFromReviewBlock(candidate, rawBlock),
		});
	}

	const missingIds = candidates
		.map((candidate) => candidate.blockId)
		.filter((blockId) => !seenIds.has(blockId));
	if (missingIds.length) {
		throw new EligibilityReviewOutputError(
			`Narration Eligibility Review missed blockIds: ${missingIds.join(", ")}`,
		);
	}

	return decisions;
}

function createGroqEligibilityReview(): EligibilityReviewBatch {
	const configured = narrationEligibilityModel();

	return async (candidates) => {
		const prompt = JSON.stringify(
			{
				blocks: candidates.map((candidate) => ({
					blockId: candidate.blockId,
					candidateText: candidate.candidateText,
				})),
			},
			null,
			2,
		);
		const result = await generateText({
			model: configured.model,
			system: systemPrompt,
			prompt,
			maxOutputTokens,
			providerOptions: configured.providerOptions,
		});

		return parseJsonObject(result.text);
	};
}

async function reviewEligibilityBatchWithRetry(input: {
	batch: NarrationEligibilityCandidate[];
	reviewBatch: EligibilityReviewBatch;
}) {
	try {
		return validateEligibilityReviewOutput(
			input.batch,
			await input.reviewBatch(input.batch),
		);
	} catch {
		const decisions: NarrationDecisionPatch[] = [];
		for (const candidate of input.batch) {
			try {
				decisions.push(
					...validateEligibilityReviewOutput(
						[candidate],
						await input.reviewBatch([candidate]),
					),
				);
			} catch {
				decisions.push({
					blockId: candidate.blockId,
					narration: { decision: "ineligible", reason: "review-failed" },
				});
			}
		}
		return decisions;
	}
}

function blockNarrationFromReviewBlock(
	candidate: NarrationEligibilityCandidate,
	block: Record<string, unknown>,
): BlockNarration {
	if (
		candidate.features.isStandaloneEquation &&
		block.decision === "ineligible"
	) {
		throw new EligibilityReviewOutputError(
			`Standalone equation block ${candidate.blockId} must be eligible`,
		);
	}

	if (block.decision === "eligible") {
		const preparation = validPreparation(block.preparation);
		if (!preparation.length) {
			throw new EligibilityReviewOutputError(
				`Eligible block ${candidate.blockId} has no Narration Preparation`,
			);
		}
		if (preparation.includes("plain") && preparation.length > 1) {
			throw new EligibilityReviewOutputError(
				`Eligible block ${candidate.blockId} combines plain with other Narration Preparation tags`,
			);
		}
		if (
			candidate.features.hasInlineCitation &&
			!preparation.includes("inline-citation-cleanup")
		) {
			throw new EligibilityReviewOutputError(
				`Eligible block ${candidate.blockId} with Inline Citations needs inline-citation-cleanup`,
			);
		}
		if (
			candidate.features.hasInlineMath &&
			!preparation.includes("inline-math")
		) {
			throw new EligibilityReviewOutputError(
				`Eligible block ${candidate.blockId} with inline math needs inline-math`,
			);
		}
		if (
			candidate.features.isStandaloneEquation &&
			!preparation.includes("equation-explanation")
		) {
			throw new EligibilityReviewOutputError(
				`Eligible standalone equation block ${candidate.blockId} needs equation-explanation`,
			);
		}
		return { decision: "eligible", preparation };
	}

	if (block.decision === "ineligible") {
		if (typeof block.reason !== "string" || !softReasonSet.has(block.reason)) {
			throw new EligibilityReviewOutputError(
				`Ineligible block ${candidate.blockId} has invalid reason`,
			);
		}
		return {
			decision: "ineligible",
			reason: block.reason as SoftIneligibleNarrationReason,
		};
	}

	throw new EligibilityReviewOutputError(
		`Block ${candidate.blockId} has invalid eligibility decision`,
	);
}

function validPreparation(value: unknown): NarrationPreparation[] {
	if (!Array.isArray(value)) return [];
	const preparations = value.filter(
		(preparation): preparation is NarrationPreparation =>
			typeof preparation === "string" && preparationSet.has(preparation),
	);
	if (preparations.length !== value.length) {
		throw new EligibilityReviewOutputError(
			"Narration Eligibility Review returned invalid preparation tags",
		);
	}
	return Array.from(new Set(preparations));
}

async function patchNarrations(
	documentId: Id<"documents">,
	narrations: NarrationDecisionPatch[],
	phase: "candidates" | "eligibility",
) {
	if (!narrations.length) return;
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
}

async function appendNarrationEvent(
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

function parseJsonObject(text: string): EligibilityReviewOutput {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
	const jsonText = fenced ?? trimmed;
	return JSON.parse(jsonText) as EligibilityReviewOutput;
}

function chunk<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
