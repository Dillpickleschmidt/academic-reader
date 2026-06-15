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
import type { HtmlNode } from "./html-fragment";
import { parseHtmlFragment } from "./html-fragment";
import { deriveNarrationCandidate } from "./narration-candidates";
import {
	appendNarrationEvent,
	getNarrationProcessingInput,
	listNarrationBlocks,
	patchNarrationTexts,
	setNarrationGuide,
} from "./narration-persistence";

export interface NarrationRewriteBlock {
	blockId: string;
	contentHtml: string;
	preparation: NarrationPreparation[];
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
	contentHtml: string;
	narration?: BlockNarration;
}

interface PreparedNarrationBlock extends NarrationRewriteBlock {
	plainText: string;
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
- inline-math: render inline mathematical notation as natural spoken prose without changing meaning.
- equation-explanation: explain standalone/display equations with their components and relationship, not merely symbol-by-symbol.

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

	const preparedBlocks = await prepareEligibleBlocks({
		documentId: input.documentId,
		blocks: eligibleBlocks,
	});
	if (!preparedBlocks.length) {
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

		texts.push({ blockId: rawBlock.blockId, text });
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
}): Promise<PreparedNarrationBlock[]> {
	const preparedBlocks: PreparedNarrationBlock[] = [];
	const skippedBlockIds: string[] = [];

	for (const block of input.blocks) {
		if (block.narration?.decision !== "eligible") continue;
		const result = deriveNarrationCandidate(block);
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
			plainText,
		});
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

	return preparedBlocks;
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
}): Promise<NarrationPreparationRunResult> {
	const plainBlocks = input.blocks.filter((block) =>
		block.preparation.includes("plain"),
	);
	const rewriteBlocks = input.blocks.filter(
		(block) => !block.preparation.includes("plain"),
	);
	let textCount = 0;
	let failedRewriteCount = 0;

	await appendNarrationEvent(input.documentId, {
		type: "narration.rewrite.started",
		emitter: "app",
		severity: "info",
		message: "Narration Text generation started.",
		emittedAt: Date.now(),
		progress: { current: 0, total: input.blocks.length, percent: 0 },
		data: {
			plainCount: plainBlocks.length,
			rewriteCount: rewriteBlocks.length,
			batchSize: rewriteBatchSize,
		},
	});

	if (plainBlocks.length) {
		const result = await patchNarrationTexts(
			input.documentId,
			plainBlocks.map((block) => ({
				blockId: block.blockId,
				text: block.plainText,
			})),
		);
		textCount += result.patchedCount;
		await appendNarrationEvent(input.documentId, {
			type: "narration.rewrite.progress",
			emitter: "app",
			severity: "info",
			message: "Plain Narration Text cleanup completed.",
			emittedAt: Date.now(),
			progress: {
				current: plainBlocks.length,
				total: input.blocks.length,
				percent: Math.round((plainBlocks.length / input.blocks.length) * 100),
				label: "Plain cleanup",
			},
			data: { patchedCount: result.patchedCount },
		});
	}

	if (!rewriteBlocks.length) {
		await appendRewriteCompletedEvent(input.documentId, {
			textCount,
			failedRewriteCount,
			total: input.blocks.length,
		});
		return {
			status: "completed",
			textCount,
			failedRewriteCount,
		};
	}

	let rewriteBatch = input.rewriteBatch;
	if (!rewriteBatch) {
		try {
			rewriteBatch = createGroqNarrationRewrite();
		} catch (error) {
			if (error instanceof AiConfigurationError) {
				await appendNarrationEvent(input.documentId, {
					type: "narration.rewrite.failed",
					emitter: "app",
					severity: "error",
					message: error.message,
					emittedAt: Date.now(),
					data: { phase: "configuration" },
				});
				return {
					status: "failed",
					phase: "rewrite",
					error: error.message,
				};
			}
			throw error;
		}
	}

	await rewriteNarrationBlocks({
		blocks: rewriteBlocks,
		narrationGuide: input.narrationGuide,
		rewriteBatch,
		onBatch: async (result, progress) => {
			const patchResult = await patchNarrationTexts(
				input.documentId,
				result.texts,
			);
			textCount += patchResult.patchedCount;
			failedRewriteCount += result.failedBlockIds.length;

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

			const current = plainBlocks.length + progress.processedCount;
			await appendNarrationEvent(input.documentId, {
				type: "narration.rewrite.progress",
				emitter: "app",
				severity: "info",
				message: "Narration Text rewrite batch completed.",
				emittedAt: Date.now(),
				progress: {
					current,
					total: input.blocks.length,
					percent: Math.round((current / input.blocks.length) * 100),
					label: `Batch ${progress.batchIndex + 1}/${progress.batchCount}`,
				},
				data: {
					batchIndex: progress.batchIndex,
					batchCount: progress.batchCount,
					patchedCount: patchResult.patchedCount,
					failedRewriteCount: result.failedBlockIds.length,
				},
			});
		},
	});

	await appendRewriteCompletedEvent(input.documentId, {
		textCount,
		failedRewriteCount,
		total: input.blocks.length,
	});

	return {
		status: "completed",
		textCount,
		failedRewriteCount,
	};
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

function decodeHtmlEntities(text: string) {
	return text.replace(
		/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
		(match, entity) => {
			const normalized = String(entity).toLowerCase();
			if (normalized === "amp") return "&";
			if (normalized === "lt") return "<";
			if (normalized === "gt") return ">";
			if (normalized === "quot") return '"';
			if (normalized === "apos") return "'";
			if (normalized === "nbsp") return " ";
			if (normalized.startsWith("#x")) {
				return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
			}
			if (normalized.startsWith("#")) {
				return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
			}
			return match;
		},
	);
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
