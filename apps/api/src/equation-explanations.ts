import type { Id } from "@academic-reader/convex/data-model";
import type { BlockType } from "@academic-reader/shared/blocks";
import {
	type AssistantMessage,
	type Context,
	createModels,
	hasApi,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { parseJsonObject } from "./ai-output";
import { createCodexCredentialStore } from "./codex-credentials";
import {
	appendEquationExplanationEvent,
	getEquationExplanationProcessingInput,
	listEquationExplanationBlocks,
	patchEquationExplanation,
} from "./equation-explanations-persistence";
import { buildModelReadableBlockContext } from "./model-readable-block-context";

export type EquationExplanationRunResult =
	| {
			status: "completed";
			generatedCount: number;
			failedCount: number;
	  }
	| { status: "failed"; error: string }
	| { status: "skipped"; reason: "disabled" | "no-equations" };

interface EquationExplanationOutput {
	blockId: string;
	contentHtml: string;
}

export interface PersistedEquationExplanation {
	blockId: string;
	order: number;
	contentHtml: string;
	model: string;
	generatedAt: number;
}

const contextCharCap = 750_000;
const maxOutputTokens = 8192;

const systemPrompt = `You are generating Equation Explanations for Academic Reader.

An Equation Explanation is reader-facing instructional HTML attached to one standalone equation Block. Teach what the equation means in this Document, define notation, connect it to nearby concepts, and build on explanations you already wrote earlier in this conversation.

Return JSON only. The JSON must have exactly this shape:
{
  "blockId": "requested block id",
  "contentHtml": "HTML fragment for the explanation"
}

contentHtml is a body fragment, not a full HTML document. Do not include html, head, body, or doctype tags. You may use instructional HTML such as headings, paragraphs, lists, tables, math, styles, or scripts; Academic Reader renders the fragment in an isolated sandboxed iframe. Prefer clear, self-contained explanations over decorative interactivity.

Use math markup consistently. Inline math must be written as <math>LaTeX</math>, and display math must be written as <math display="block">LaTeX</math>. Do not leave mathematical symbols as invisible native-MathML text or as bare prose blanks.`;

export async function runEquationExplanationsForDocument(input: {
	documentId: Id<"documents">;
	onEquationExplanationPersisted?: (
		explanation: PersistedEquationExplanation,
	) => Promise<void> | void;
}): Promise<EquationExplanationRunResult> {
	const metadata = await getEquationExplanationProcessingInput(
		input.documentId,
	);

	if (!metadata.processingConfiguration.equationExplanations.enabled) {
		return { status: "skipped", reason: "disabled" };
	}

	const blocks = await listEquationExplanationBlocks(input.documentId);
	const equationBlocks = blocks
		.filter((block) => block.blockType === "equation")
		.sort((a, b) => a.order - b.order);

	await appendEquationExplanationEvent(input.documentId, {
		type: "equation.explanation.started",
		emitter: "app",
		severity: "info",
		message: "Equation Explanation generation started.",
		emittedAt: Date.now(),
		progress: { current: 0, total: equationBlocks.length, percent: 0 },
		data: {
			model: equationExplanationModelName(),
			equationCount: equationBlocks.length,
		},
	});

	if (!equationBlocks.length) {
		await appendEquationExplanationEvent(input.documentId, {
			type: "equation.explanation.completed",
			emitter: "app",
			severity: "info",
			message:
				"Equation Explanation generation skipped because no equation Blocks were found.",
			emittedAt: Date.now(),
			progress: { current: 0, total: 0, percent: 100 },
			data: { generatedCount: 0, failedCount: 0 },
		});
		return { status: "skipped", reason: "no-equations" };
	}

	let context: Context;
	try {
		context = buildEquationExplanationContext({ blocks });
	} catch (error) {
		await appendEquationExplanationEvent(input.documentId, {
			type: "equation.explanation.failed",
			emitter: "app",
			severity: "error",
			message: errorMessage(error),
			emittedAt: Date.now(),
		});
		return { status: "failed", error: errorMessage(error) };
	}

	const credentialStore = createCodexCredentialStore(metadata.readerId);
	if (!(await credentialStore.read("openai-codex"))) {
		const message = "Equation Explanations require a Codex Connection.";
		await appendEquationExplanationEvent(input.documentId, {
			type: "equation.explanation.failed",
			emitter: "app",
			severity: "error",
			message,
			emittedAt: Date.now(),
		});
		return { status: "failed", error: message };
	}

	const models = createModels({ credentials: credentialStore });
	models.setProvider(openaiCodexProvider());
	const modelName = equationExplanationModelName();
	const model = models.getModel("openai-codex", modelName);
	if (!model || !hasApi(model, "openai-codex-responses")) {
		const message = `Unknown Codex Equation Explanation model: ${modelName}`;
		await appendEquationExplanationEvent(input.documentId, {
			type: "equation.explanation.failed",
			emitter: "app",
			severity: "error",
			message,
			emittedAt: Date.now(),
		});
		return { status: "failed", error: message };
	}

	let generatedCount = 0;
	let failedCount = 0;
	const sessionId = `equation-explanations:${input.documentId}`;

	for (const [index, block] of equationBlocks.entries()) {
		const prompt = equationPrompt(block.blockId);
		const userMessage = {
			role: "user" as const,
			content: prompt,
			timestamp: Date.now(),
		};
		context.messages.push(userMessage);

		try {
			const assistant = await models.complete(model, context, {
				maxTokens: maxOutputTokens,
				reasoningEffort: "minimal",
				sessionId,
				textVerbosity: "medium",
				transport: "auto",
			});
			const explanation = validateEquationExplanationOutput(
				block.blockId,
				parseJsonObject<EquationExplanationOutput>(assistantText(assistant)),
			);
			const generatedAt = Date.now();
			await patchEquationExplanation(input.documentId, {
				blockId: block.blockId,
				contentHtml: explanation.contentHtml,
				model: modelName,
				generatedAt,
			});
			try {
				await input.onEquationExplanationPersisted?.({
					blockId: block.blockId,
					order: block.order,
					contentHtml: explanation.contentHtml,
					model: modelName,
					generatedAt,
				});
			} catch (error) {
				void error;
			}
			context.messages.push(assistant);
			generatedCount += 1;
		} catch (error) {
			if (context.messages.at(-1) === userMessage) context.messages.pop();
			failedCount += 1;
			await appendEquationExplanationEvent(input.documentId, {
				type: "equation.explanation.warning",
				emitter: "codex",
				severity: "warning",
				message: "Equation Explanation generation failed for a Block.",
				emittedAt: Date.now(),
				blockId: block.blockId,
				data: { error: errorMessage(error), model: modelName },
			});
		}

		await appendEquationExplanationEvent(input.documentId, {
			type: "equation.explanation.progress",
			emitter: "app",
			severity: "info",
			message: "Equation Explanation item completed.",
			emittedAt: Date.now(),
			blockId: block.blockId,
			progress: {
				current: index + 1,
				total: equationBlocks.length,
				percent: Math.round(((index + 1) / equationBlocks.length) * 100),
			},
			data: { generatedCount, failedCount },
		});
	}

	await appendEquationExplanationEvent(input.documentId, {
		type: "equation.explanation.completed",
		emitter: "app",
		severity: failedCount ? "warning" : "info",
		message: failedCount
			? "Equation Explanation generation completed with Block failures."
			: "Equation Explanation generation completed.",
		emittedAt: Date.now(),
		progress: {
			current: equationBlocks.length,
			total: equationBlocks.length,
			percent: 100,
		},
		data: { generatedCount, failedCount },
	});

	return { status: "completed", generatedCount, failedCount };
}

export function validateEquationExplanationOutput(
	blockId: string,
	output: unknown,
): EquationExplanationOutput {
	if (!isRecord(output)) {
		throw new Error("Equation Explanation output must be a JSON object");
	}
	if (output.blockId !== blockId) {
		throw new Error(
			`Equation Explanation returned wrong blockId for ${blockId}`,
		);
	}
	if (typeof output.contentHtml !== "string") {
		throw new Error(
			`Equation Explanation for ${blockId} is missing contentHtml`,
		);
	}
	const contentHtml = output.contentHtml.trim();
	if (!contentHtml) {
		throw new Error(`Equation Explanation for ${blockId} is empty`);
	}
	if (/<\s*(?:html|head|body)\b|<!doctype/i.test(contentHtml)) {
		throw new Error(
			`Equation Explanation for ${blockId} must be an HTML fragment`,
		);
	}
	return { blockId, contentHtml };
}

function buildEquationExplanationContext(input: {
	blocks: Array<{
		blockId: string;
		blockType: BlockType;
		order: number;
		pageNumber?: number;
		contentHtml: string;
	}>;
}): Context {
	const documentContext = JSON.stringify(
		{
			blocks: input.blocks.map((block) => {
				const context = buildModelReadableBlockContext(block);
				return {
					blockId: context.blockId,
					blockType: context.blockType,
					order: context.order,
					pageNumber: context.pageNumber,
					plainText: context.plainText,
					contentHtml: context.contentHtml,
				};
			}),
		},
		null,
		2,
	);

	if (documentContext.length > contextCharCap) {
		throw new Error(
			`Equation Explanation context is too large (${documentContext.length}/${contextCharCap} characters)`,
		);
	}

	return {
		systemPrompt,
		messages: [
			{
				role: "user",
				content: `Here is the ordered Academic Reader Block context for the Document. Use it as the source of truth for all Equation Explanations.\n\n${documentContext}`,
				timestamp: Date.now(),
			},
		],
	};
}

function equationPrompt(blockId: string) {
	return `Generate the Equation Explanation for equation Block ${blockId}. Return JSON only with blockId ${JSON.stringify(blockId)} and contentHtml.`;
}

function assistantText(message: AssistantMessage) {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
}

function equationExplanationModelName() {
	return process.env.EQUATION_EXPLANATION_MODEL?.trim() || "gpt-5.5";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
