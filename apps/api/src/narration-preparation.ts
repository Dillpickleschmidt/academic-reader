import type { Id } from "@academic-reader/convex/data-model";
import type { BlockType } from "@academic-reader/shared/blocks";
import type {
	BlockNarration,
	NarrationPreparation,
} from "@academic-reader/shared/narration";
import { generateText } from "ai";
import {
	AiConfigurationError,
	narrationGuideModel,
	narrationRewriteModel,
} from "./ai";
import { parseJsonObject } from "./ai-output";
import type { PersistedEquationExplanation } from "./equation-explanations";
import type { HtmlNode } from "./html-fragment";
import { decodeHtmlEntities, parseHtmlFragment } from "./html-fragment";
import { deriveNarrationCandidate } from "./narration-candidates";
import {
	appendNarrationEvent,
	getNarrationProcessingInput,
	listNarrationBlocks,
	patchNarrationDecisions,
	patchNarrationTexts,
	setNarrationGuide,
} from "./narration-persistence";

export interface NarrationRewriteBlock {
	blockId: string;
	contentHtml: string;
	preparation: NarrationPreparation[];
	order?: number;
}

export interface NarrationRewriteOutput {
	blocks: Array<{
		blockId: string;
		text: string;
	}>;
}

export interface NarrationTextPatch {
	blockId: string;
	text: string;
	order?: number;
}

export type NarrationGuideGenerator = (inputText: string) => Promise<string>;

export type NarrationRewriteBatch = (
	blocks: NarrationRewriteBlock[],
	narrationGuide: string,
) => Promise<NarrationRewriteOutput>;

export type NarrationPreparationRunResult =
	| {
			status: "completed";
			textCount: number;
			failedRewriteCount: number;
	  }
	| { status: "failed"; phase: "guide" | "rewrite"; error: string }
	| { status: "skipped"; reason: "narration-disabled" | "no-eligible-blocks" };

interface NarrationPreparationSourceBlock {
	blockId: string;
	blockType: BlockType;
	order: number;
	contentHtml: string;
	equationExplanation?: {
		contentHtml: string;
		model: string;
		generatedAt: number;
	};
	narration?: BlockNarration;
}

interface PreparedNarrationBlock extends NarrationRewriteBlock {
	plainText: string;
}

interface PreparedNarrationBlocksResult {
	blocks: PreparedNarrationBlock[];
	pendingEquationBlockIds: string[];
}

export const narrationGuideInputCharCap = 350_000;
const rewriteBatchSize = 4;
const guideMaxOutputTokens = 2048;
const rewriteMaxOutputTokens = 8192;

const guideSystemPrompt = `You are creating a Narration Guide for Academic Reader.

The guide is internal context for later per-Block Narration Text preparation. It is not shown directly to the reader. Use the eligible document text to produce compact guidance that helps rewrite Blocks into precise spoken text.

Include only useful guidance:
- important terminology and abbreviations
- notation, symbols, variables, and pronunciation conventions
- domain-specific names or phrases that should be read consistently
- citation handling guidance if relevant
- style guidance for preserving technical meaning

Do not include phonetic spellings or pronunciation advice for ordinary English words. Do not include human narration notes. Do not summarize the document for the reader. Do not include markup. Return plain text only.`;

const rewriteSystemPrompt = `You are preparing Narration Text for Academic Reader.

You receive a document-level Narration Guide and a batch of eligible Blocks. Every input Block has already passed Narration Eligibility. Do not decide whether to include Blocks.

Return exactly one plain-text output for every input blockId. Never skip, merge, rename, summarize, or omit an input blockId. Preserve technical meaning and avoid dropping details.

Preparation directives:
- inline-citation-cleanup: use the persisted <span class="inline-citation"> markup to smooth or omit inline citations naturally for speech.
- inline-math: render mathematical notation as natural spoken prose without changing meaning.

Output plain text only. Do not return HTML, Markdown, SSML, XML, or code fences.

Return JSON only in this exact shape:
{
  "blocks": [
    { "blockId": "input block id", "text": "plain spoken narration text" }
  ]
}`;

export async function runNarrationPreparationForDocument(input: {
	documentId: Id<"documents">;
	generateGuide?: NarrationGuideGenerator;
	rewriteBatch?: NarrationRewriteBatch;
	equationExplanations?: AsyncIterable<PersistedEquationExplanation>;
	onNarrationTextsPersisted?: (
		texts: NarrationTextPatch[],
	) => Promise<void> | void;
}): Promise<NarrationPreparationRunResult> {
	const metadata = await getNarrationProcessingInput(input.documentId);

	if (!metadata.processingConfiguration.narration.enabled) {
		return { status: "skipped", reason: "narration-disabled" };
	}

	const blocks = await listNarrationBlocks(input.documentId);
	const missingNarrationBlocks = blocks.filter(
		(block) => block.narration === undefined,
	);
	if (missingNarrationBlocks.length) {
		const message =
			"Narration Preparation requires eligibility for every Block.";
		await appendNarrationEvent(input.documentId, {
			type: "narration.guide.failed",
			emitter: "app",
			severity: "error",
			message,
			emittedAt: Date.now(),
			data: {
				missingNarrationBlockCount: missingNarrationBlocks.length,
				blockIds: missingNarrationBlocks
					.slice(0, 20)
					.map((block) => block.blockId),
			},
		});
		return { status: "failed", phase: "guide", error: message };
	}

	const eligibleBlocks = blocks.filter(
		(block) => block.narration?.decision === "eligible",
	);
	if (!eligibleBlocks.length) {
		await appendNoEligibleBlocksEvents(input.documentId);
		return { status: "skipped", reason: "no-eligible-blocks" };
	}

	const pendingBlocks = eligibleBlocks.filter(
		(block) =>
			block.narration?.decision === "eligible" && !block.narration.text,
	);
	if (!pendingBlocks.length) {
		return { status: "completed", textCount: 0, failedRewriteCount: 0 };
	}

	const blockById = new Map(
		pendingBlocks.map((block) => [block.blockId, block]),
	);
	const equationIterator = input.equationExplanations?.[Symbol.asyncIterator]();
	const prepared = await prepareEligibleBlocks({
		documentId: input.documentId,
		blocks: pendingBlocks,
		keepMissingEquationExplanationsPending: equationIterator !== undefined,
	});
	const pendingEquationBlockIds = new Set(prepared.pendingEquationBlockIds);
	const preparedBlocks = [...prepared.blocks];

	if (
		!preparedBlocks.length &&
		pendingEquationBlockIds.size &&
		equationIterator
	) {
		const firstPendingBlock = await nextPendingEquationBlock({
			documentId: input.documentId,
			iterator: equationIterator,
			blockById,
			pendingEquationBlockIds,
		});
		if (firstPendingBlock) preparedBlocks.push(firstPendingBlock);
	}

	if (!preparedBlocks.length) {
		if (pendingEquationBlockIds.size) {
			await markMissingEquationExplanationsUnavailable(input.documentId, [
				...pendingEquationBlockIds,
			]);
		}
		await appendNoEligibleBlocksEvents(input.documentId);
		return { status: "skipped", reason: "no-eligible-blocks" };
	}

	let narrationGuide: string;
	try {
		narrationGuide = await generateNarrationGuide({
			documentId: input.documentId,
			blocks: preparedBlocks,
			generateGuide: input.generateGuide,
		});
	} catch (error) {
		return {
			status: "failed",
			phase: "guide",
			error: errorMessage(error),
		};
	}

	try {
		return await generateNarrationTexts({
			documentId: input.documentId,
			narrationGuide,
			blocks: preparedBlocks,
			rewriteBatch: input.rewriteBatch,
			onNarrationTextsPersisted: input.onNarrationTextsPersisted,
			totalBlockCount: preparedBlocks.length + pendingEquationBlockIds.size,
			pendingEquationBlockIds,
			nextPendingEquationBlock: equationIterator
				? () =>
						nextPendingEquationBlock({
							documentId: input.documentId,
							iterator: equationIterator,
							blockById,
							pendingEquationBlockIds,
						})
				: undefined,
		});
	} catch (error) {
		await appendNarrationEvent(input.documentId, {
			type: "narration.rewrite.failed",
			emitter: "app",
			severity: "error",
			message: errorMessage(error),
			emittedAt: Date.now(),
		});
		return {
			status: "failed",
			phase: "rewrite",
			error: errorMessage(error),
		};
	}
}

export function htmlToNarrationText(html: string) {
	return normalizeNarrationText(
		textContentForNarration(parseHtmlFragment(html)),
	);
}

export function buildNarrationGuideInput(
	texts: string[],
	charCap = narrationGuideInputCharCap,
) {
	let text = "";
	let fullCharCount = 0;
	let includedBlockCount = 0;
	let truncated = false;

	for (const value of texts) {
		const blockText = value.trim();
		if (!blockText) continue;

		const next = text ? `\n\n${blockText}` : blockText;
		fullCharCount += next.length;

		if (text.length >= charCap) {
			truncated = true;
			continue;
		}

		const remaining = charCap - text.length;
		if (next.length > remaining) {
			if (!text) {
				text = next.slice(0, remaining);
				includedBlockCount += 1;
			}
			truncated = true;
			continue;
		}
		text += next;
		includedBlockCount += 1;
	}

	return {
		text: text.trim(),
		truncated,
		inputCharCount: fullCharCount,
		includedBlockCount,
	};
}

export async function rewriteNarrationBlocks(input: {
	blocks: NarrationRewriteBlock[];
	narrationGuide: string;
	rewriteBatch: NarrationRewriteBatch;
	batchSize?: number;
	onBatch?: (
		result: {
			texts: NarrationTextPatch[];
			failedBlockIds: string[];
		},
		progress: {
			batchIndex: number;
			batchCount: number;
			processedCount: number;
		},
	) => Promise<void> | void;
}) {
	const batchSize = input.batchSize ?? rewriteBatchSize;
	const batches = chunk(input.blocks, batchSize);
	const texts: NarrationTextPatch[] = [];
	const failedBlockIds: string[] = [];
	let processedCount = 0;

	for (const [batchIndex, batch] of batches.entries()) {
		const result = await rewriteNarrationBatchWithRetry({
			batch,
			narrationGuide: input.narrationGuide,
			rewriteBatch: input.rewriteBatch,
		});
		texts.push(...result.texts);
		failedBlockIds.push(...result.failedBlockIds);
		processedCount += batch.length;
		await input.onBatch?.(result, {
			batchIndex,
			batchCount: batches.length,
			processedCount,
		});
	}

	return { texts, failedBlockIds };
}

export function validateNarrationRewriteOutput(
	blocks: NarrationRewriteBlock[],
	output: unknown,
): NarrationTextPatch[] {
	if (!isRecord(output) || !Array.isArray(output.blocks)) {
		throw new NarrationRewriteOutputError(
			"Narration Text rewrite output must include a blocks array",
		);
	}

	const blockById = new Map(blocks.map((block) => [block.blockId, block]));
	const seenIds = new Set<string>();
	const texts: NarrationTextPatch[] = [];

	for (const rawBlock of output.blocks) {
		if (!isRecord(rawBlock) || typeof rawBlock.blockId !== "string") {
			throw new NarrationRewriteOutputError(
				"Narration Text rewrite output block is invalid",
			);
		}
		if (!blockById.has(rawBlock.blockId)) {
			throw new NarrationRewriteOutputError(
				`Narration Text rewrite returned unknown blockId ${rawBlock.blockId}`,
			);
		}
		if (seenIds.has(rawBlock.blockId)) {
			throw new NarrationRewriteOutputError(
				`Narration Text rewrite duplicated blockId ${rawBlock.blockId}`,
			);
		}
		seenIds.add(rawBlock.blockId);

		if (typeof rawBlock.text !== "string") {
			throw new NarrationRewriteOutputError(
				`Narration Text rewrite for ${rawBlock.blockId} is missing text`,
			);
		}
		const text = normalizeNarrationText(rawBlock.text);
		if (!text) {
			throw new NarrationRewriteOutputError(
				`Narration Text rewrite for ${rawBlock.blockId} is empty`,
			);
		}
		if (/<\s*\/?[A-Za-z][^>]*>/.test(text)) {
			throw new NarrationRewriteOutputError(
				`Narration Text rewrite for ${rawBlock.blockId} contains markup`,
			);
		}

		const order = blockById.get(rawBlock.blockId)?.order;
		texts.push(
			order === undefined
				? { blockId: rawBlock.blockId, text }
				: { blockId: rawBlock.blockId, text, order },
		);
	}

	const missingIds = blocks
		.map((block) => block.blockId)
		.filter((blockId) => !seenIds.has(blockId));
	if (missingIds.length) {
		throw new NarrationRewriteOutputError(
			`Narration Text rewrite missed blockIds: ${missingIds.join(", ")}`,
		);
	}

	return texts;
}

export class NarrationRewriteOutputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NarrationRewriteOutputError";
	}
}

async function prepareEligibleBlocks(input: {
	documentId: Id<"documents">;
	blocks: NarrationPreparationSourceBlock[];
	keepMissingEquationExplanationsPending?: boolean;
}): Promise<PreparedNarrationBlocksResult> {
	const preparedBlocks: PreparedNarrationBlock[] = [];
	const skippedBlockIds: string[] = [];
	const missingEquationExplanationBlockIds: string[] = [];

	for (const block of input.blocks) {
		if (block.narration?.decision !== "eligible") continue;
		if (block.blockType === "equation" && !block.equationExplanation) {
			missingEquationExplanationBlockIds.push(block.blockId);
			continue;
		}
		const result = deriveNarrationCandidate({
			blockId: block.blockId,
			blockType: block.blockType,
			contentHtml: block.equationExplanation?.contentHtml ?? block.contentHtml,
		});
		if (result.kind !== "candidate") {
			skippedBlockIds.push(block.blockId);
			continue;
		}
		const plainText = htmlToNarrationText(result.candidateText);
		if (!plainText) {
			skippedBlockIds.push(block.blockId);
			continue;
		}
		preparedBlocks.push({
			blockId: block.blockId,
			contentHtml: result.candidateText,
			preparation: block.narration.preparation,
			order: block.order,
			plainText,
		});
	}

	if (
		missingEquationExplanationBlockIds.length &&
		!input.keepMissingEquationExplanationsPending
	) {
		await markMissingEquationExplanationsUnavailable(
			input.documentId,
			missingEquationExplanationBlockIds,
		);
	}

	if (skippedBlockIds.length) {
		await appendNarrationEvent(input.documentId, {
			type: "narration.guide.warning",
			emitter: "app",
			severity: "warning",
			message:
				"Some eligible Blocks could not be converted to Narration Guide input.",
			emittedAt: Date.now(),
			data: { blockIds: skippedBlockIds.slice(0, 20) },
		});
	}

	return {
		blocks: preparedBlocks,
		pendingEquationBlockIds: input.keepMissingEquationExplanationsPending
			? missingEquationExplanationBlockIds
			: [],
	};
}

async function nextPendingEquationBlock(input: {
	documentId: Id<"documents">;
	iterator: AsyncIterator<PersistedEquationExplanation>;
	blockById: Map<string, NarrationPreparationSourceBlock>;
	pendingEquationBlockIds: Set<string>;
}): Promise<PreparedNarrationBlock | undefined> {
	while (input.pendingEquationBlockIds.size) {
		const next = await input.iterator.next();
		if (next.done) return undefined;

		const block = input.blockById.get(next.value.blockId);
		if (!block || !input.pendingEquationBlockIds.has(block.blockId)) {
			continue;
		}

		input.pendingEquationBlockIds.delete(block.blockId);
		block.equationExplanation = {
			contentHtml: next.value.contentHtml,
			model: next.value.model,
			generatedAt: next.value.generatedAt,
		};
		const prepared = await prepareEligibleBlocks({
			documentId: input.documentId,
			blocks: [block],
			keepMissingEquationExplanationsPending: true,
		});
		const [preparedBlock] = prepared.blocks;
		if (preparedBlock) return preparedBlock;
	}

	return undefined;
}

async function markMissingEquationExplanationsUnavailable(
	documentId: Id<"documents">,
	blockIds: string[],
) {
	if (!blockIds.length) return;

	await patchNarrationDecisions(
		documentId,
		blockIds.map((blockId) => ({
			blockId,
			narration: {
				decision: "ineligible",
				reason: "equation-explanation-unavailable",
			},
		})),
		"guide",
	);
	await appendNarrationEvent(documentId, {
		type: "narration.guide.warning",
		emitter: "app",
		severity: "warning",
		message:
			"Some standalone equation Blocks were skipped because Equation Explanations were unavailable.",
		emittedAt: Date.now(),
		data: { blockIds: blockIds.slice(0, 20) },
	});
}

async function generateNarrationGuide(input: {
	documentId: Id<"documents">;
	blocks: PreparedNarrationBlock[];
	generateGuide?: NarrationGuideGenerator;
}) {
	const guideInput = buildNarrationGuideInput(
		input.blocks.map((block) => block.plainText),
	);

	await appendNarrationEvent(input.documentId, {
		type: "narration.guide.started",
		emitter: "app",
		severity: "info",
		message: "Narration Guide generation started.",
		emittedAt: Date.now(),
		data: {
			eligibleBlockCount: input.blocks.length,
			inputCharCount: guideInput.inputCharCount,
			inputCharCap: narrationGuideInputCharCap,
		},
	});

	if (guideInput.truncated) {
		await appendNarrationEvent(input.documentId, {
			type: "narration.guide.warning",
			emitter: "app",
			severity: "warning",
			message: "Narration Guide input was truncated.",
			emittedAt: Date.now(),
			data: {
				inputCharCount: guideInput.inputCharCount,
				inputCharCap: narrationGuideInputCharCap,
				includedBlockCount: guideInput.includedBlockCount,
			},
		});
	}

	let generateGuide = input.generateGuide;
	if (!generateGuide) {
		try {
			generateGuide = createGroqNarrationGuide();
		} catch (error) {
			if (error instanceof AiConfigurationError) {
				await appendNarrationEvent(input.documentId, {
					type: "narration.guide.failed",
					emitter: "app",
					severity: "error",
					message: error.message,
					emittedAt: Date.now(),
					data: { phase: "configuration" },
				});
			}
			throw error;
		}
	}

	try {
		const narrationGuide = normalizeNarrationText(
			await generateGuide(guideInput.text),
		);
		if (!narrationGuide) throw new Error("Narration Guide was empty");

		await setNarrationGuide(input.documentId, narrationGuide);

		await appendNarrationEvent(input.documentId, {
			type: "narration.guide.completed",
			emitter: "app",
			severity: "info",
			message: "Narration Guide generation completed.",
			emittedAt: Date.now(),
			data: {
				guideCharCount: narrationGuide.length,
				inputCharCount: guideInput.text.length,
				truncated: guideInput.truncated,
			},
		});

		return narrationGuide;
	} catch (error) {
		await appendNarrationEvent(input.documentId, {
			type: "narration.guide.failed",
			emitter: "app",
			severity: "error",
			message: errorMessage(error),
			emittedAt: Date.now(),
		});
		throw error;
	}
}

async function generateNarrationTexts(input: {
	documentId: Id<"documents">;
	narrationGuide: string;
	blocks: PreparedNarrationBlock[];
	rewriteBatch?: NarrationRewriteBatch;
	onNarrationTextsPersisted?: (
		texts: NarrationTextPatch[],
	) => Promise<void> | void;
	totalBlockCount?: number;
	pendingEquationBlockIds?: Set<string>;
	nextPendingEquationBlock?: () => Promise<PreparedNarrationBlock | undefined>;
}): Promise<NarrationPreparationRunResult> {
	const plainBlocks = input.blocks.filter((block) =>
		block.preparation.includes("plain"),
	);
	const rewriteBlocks = input.blocks.filter(
		(block) => !block.preparation.includes("plain"),
	);
	const totalBlockCount = input.totalBlockCount ?? input.blocks.length;
	let textCount = 0;
	let failedRewriteCount = 0;
	let processedCount = 0;
	let rewriteBatch = input.rewriteBatch;
	let rewriteConfigurationError: string | undefined;

	await appendNarrationEvent(input.documentId, {
		type: "narration.rewrite.started",
		emitter: "app",
		severity: "info",
		message: "Narration Text generation started.",
		emittedAt: Date.now(),
		progress: { current: 0, total: totalBlockCount, percent: 0 },
		data: {
			plainCount: plainBlocks.length,
			rewriteCount: rewriteBlocks.length,
			pendingEquationCount: input.pendingEquationBlockIds?.size ?? 0,
			batchSize: rewriteBatchSize,
		},
	});

	async function getRewriteBatch() {
		if (rewriteBatch) return rewriteBatch;
		try {
			rewriteBatch = createGroqNarrationRewrite();
			return rewriteBatch;
		} catch (error) {
			if (error instanceof AiConfigurationError) {
				rewriteConfigurationError = error.message;
				await appendNarrationEvent(input.documentId, {
					type: "narration.rewrite.failed",
					emitter: "app",
					severity: "error",
					message: error.message,
					emittedAt: Date.now(),
					data: { phase: "configuration" },
				});
				return undefined;
			}
			throw error;
		}
	}

	async function persistPlainBlocks(
		blocks: PreparedNarrationBlock[],
		label: string,
	) {
		if (!blocks.length) return;
		const plainTexts = blocks.map((block) => ({
			blockId: block.blockId,
			text: block.plainText,
			order: block.order,
		}));
		const result = await patchNarrationTexts(input.documentId, plainTexts);
		const persistedPlainTexts = persistedTexts(
			plainTexts,
			result.patchedBlockIds,
		);
		textCount += result.patchedCount;
		processedCount += blocks.length;
		await appendNarrationEvent(input.documentId, {
			type: "narration.rewrite.progress",
			emitter: "app",
			severity: "info",
			message: "Plain Narration Text cleanup completed.",
			emittedAt: Date.now(),
			progress: {
				current: processedCount,
				total: totalBlockCount,
				percent: Math.round((processedCount / totalBlockCount) * 100),
				label,
			},
			data: { patchedCount: result.patchedCount },
		});
		await input.onNarrationTextsPersisted?.(persistedPlainTexts);
	}

	async function rewritePreparedBlocks(
		blocks: PreparedNarrationBlock[],
		label: (progress: { batchIndex: number; batchCount: number }) => string,
	): Promise<NarrationPreparationRunResult | undefined> {
		if (!blocks.length) return undefined;
		const batch = await getRewriteBatch();
		if (!batch) {
			return {
				status: "failed",
				phase: "rewrite",
				error:
					rewriteConfigurationError ??
					"Narration Text rewrite model is not configured.",
			};
		}

		let previouslyProcessedInCall = 0;
		await rewriteNarrationBlocks({
			blocks,
			narrationGuide: input.narrationGuide,
			rewriteBatch: batch,
			onBatch: async (result, progress) => {
				const patchResult = await patchNarrationTexts(
					input.documentId,
					result.texts,
				);
				const persistedRewriteTexts = persistedTexts(
					result.texts,
					patchResult.patchedBlockIds,
				);
				textCount += patchResult.patchedCount;
				failedRewriteCount += result.failedBlockIds.length;
				processedCount += progress.processedCount - previouslyProcessedInCall;
				previouslyProcessedInCall = progress.processedCount;

				if (result.failedBlockIds.length) {
					await appendNarrationEvent(input.documentId, {
						type: "narration.rewrite.warning",
						emitter: "app",
						severity: "warning",
						message: "Some Blocks failed Narration Text rewrite.",
						emittedAt: Date.now(),
						data: { blockIds: result.failedBlockIds.slice(0, 20) },
					});
				}

				await appendNarrationEvent(input.documentId, {
					type: "narration.rewrite.progress",
					emitter: "app",
					severity: "info",
					message: "Narration Text rewrite batch completed.",
					emittedAt: Date.now(),
					progress: {
						current: processedCount,
						total: totalBlockCount,
						percent: Math.round((processedCount / totalBlockCount) * 100),
						label: label(progress),
					},
					data: {
						batchIndex: progress.batchIndex,
						batchCount: progress.batchCount,
						patchedCount: patchResult.patchedCount,
						failedRewriteCount: result.failedBlockIds.length,
					},
				});
				await input.onNarrationTextsPersisted?.(persistedRewriteTexts);
			},
		});
		return undefined;
	}

	await persistPlainBlocks(plainBlocks, "Plain cleanup");
	const initialRewriteResult = await rewritePreparedBlocks(
		rewriteBlocks,
		(progress) => `Batch ${progress.batchIndex + 1}/${progress.batchCount}`,
	);
	if (initialRewriteResult) return initialRewriteResult;

	while (input.nextPendingEquationBlock) {
		const block = await input.nextPendingEquationBlock();
		if (!block) break;
		if (block.preparation.includes("plain")) {
			await persistPlainBlocks([block], "Pending equation cleanup");
			continue;
		}
		const pendingRewriteResult = await rewritePreparedBlocks(
			[block],
			() => "Pending equation",
		);
		if (pendingRewriteResult) return pendingRewriteResult;
	}

	if (input.pendingEquationBlockIds?.size) {
		const unavailableBlockIds = [...input.pendingEquationBlockIds];
		await markMissingEquationExplanationsUnavailable(
			input.documentId,
			unavailableBlockIds,
		);
		processedCount += unavailableBlockIds.length;
		await appendNarrationEvent(input.documentId, {
			type: "narration.rewrite.progress",
			emitter: "app",
			severity: "info",
			message: "Unavailable equation Blocks skipped for Narration Text.",
			emittedAt: Date.now(),
			progress: {
				current: processedCount,
				total: totalBlockCount,
				percent: Math.round((processedCount / totalBlockCount) * 100),
				label: "Unavailable equations",
			},
			data: { blockIds: unavailableBlockIds.slice(0, 20) },
		});
	}

	await appendRewriteCompletedEvent(input.documentId, {
		textCount,
		failedRewriteCount,
		total: totalBlockCount,
	});

	return {
		status: "completed",
		textCount,
		failedRewriteCount,
	};
}

function persistedTexts(
	texts: NarrationTextPatch[],
	patchedBlockIds: string[],
) {
	const patchedBlockIdSet = new Set(patchedBlockIds);
	return texts.filter((text) => patchedBlockIdSet.has(text.blockId));
}

function createGroqNarrationGuide(): NarrationGuideGenerator {
	const configured = narrationGuideModel();

	return async (inputText) => {
		const result = await generateText({
			model: configured.model,
			system: guideSystemPrompt,
			prompt: inputText,
			maxOutputTokens: guideMaxOutputTokens,
			providerOptions: configured.providerOptions,
		});

		return result.text;
	};
}

function createGroqNarrationRewrite(): NarrationRewriteBatch {
	const configured = narrationRewriteModel();

	return async (blocks, narrationGuide) => {
		const result = await generateText({
			model: configured.model,
			system: rewriteSystemPrompt,
			prompt: JSON.stringify(
				{
					narrationGuide,
					blocks: blocks.map((block) => ({
						blockId: block.blockId,
						preparation: block.preparation,
						contentHtml: block.contentHtml,
					})),
				},
				null,
				2,
			),
			maxOutputTokens: rewriteMaxOutputTokens,
			providerOptions: configured.providerOptions,
		});

		return parseJsonObject<NarrationRewriteOutput>(result.text);
	};
}

async function rewriteNarrationBatchWithRetry(input: {
	batch: NarrationRewriteBlock[];
	narrationGuide: string;
	rewriteBatch: NarrationRewriteBatch;
}) {
	try {
		return {
			texts: validateNarrationRewriteOutput(
				input.batch,
				await input.rewriteBatch(input.batch, input.narrationGuide),
			),
			failedBlockIds: [],
		};
	} catch {
		const texts: NarrationTextPatch[] = [];
		const failedBlockIds: string[] = [];

		for (const block of input.batch) {
			try {
				texts.push(
					...validateNarrationRewriteOutput(
						[block],
						await input.rewriteBatch([block], input.narrationGuide),
					),
				);
			} catch {
				failedBlockIds.push(block.blockId);
			}
		}

		return { texts, failedBlockIds };
	}
}

async function appendNoEligibleBlocksEvents(documentId: Id<"documents">) {
	await appendNarrationEvent(documentId, {
		type: "narration.guide.warning",
		emitter: "app",
		severity: "warning",
		message:
			"Narration Preparation skipped because no eligible Blocks were found.",
		emittedAt: Date.now(),
	});
	await appendNarrationEvent(documentId, {
		type: "narration.guide.completed",
		emitter: "app",
		severity: "info",
		message: "Narration Guide generation skipped.",
		emittedAt: Date.now(),
		data: { eligibleBlockCount: 0 },
	});
	await appendNarrationEvent(documentId, {
		type: "narration.rewrite.completed",
		emitter: "app",
		severity: "info",
		message: "Narration Text generation skipped.",
		emittedAt: Date.now(),
		progress: { current: 0, total: 0, percent: 100 },
		data: { textCount: 0, failedRewriteCount: 0 },
	});
}

async function appendRewriteCompletedEvent(
	documentId: Id<"documents">,
	input: { textCount: number; failedRewriteCount: number; total: number },
) {
	await appendNarrationEvent(documentId, {
		type: "narration.rewrite.completed",
		emitter: "app",
		severity: input.failedRewriteCount ? "warning" : "info",
		message: input.failedRewriteCount
			? "Narration Text generation completed with rewrite failures."
			: "Narration Text generation completed.",
		emittedAt: Date.now(),
		progress: { current: input.total, total: input.total, percent: 100 },
		data: {
			textCount: input.textCount,
			failedRewriteCount: input.failedRewriteCount,
		},
	});
}

function textContentForNarration(node: HtmlNode): string {
	if (node.kind === "text") return decodeHtmlEntities(node.raw);
	if (node.kind === "raw") return "";
	if (node.kind === "root") {
		return node.children.map(textContentForNarration).join(" ");
	}
	if (node.name === "br") return " ";

	return ` ${node.children.map(textContentForNarration).join("")} `;
}

function normalizeNarrationText(text: string) {
	return decodeHtmlEntities(text)
		.replace(/\s+/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.trim();
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
