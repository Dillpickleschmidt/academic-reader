import { describe, expect, test } from "bun:test";
import type { NarrationPreparation } from "@academic-reader/shared/narration";
import {
	buildNarrationGuideInput,
	htmlToNarrationText,
	type NarrationRewriteBatch,
	type NarrationRewriteBlock,
	rewriteNarrationBlocks,
	validateNarrationRewriteOutput,
} from "./narration-preparation";

function rewriteBlock(
	blockId: string,
	preparation: NarrationPreparation[] = ["inline-citation-cleanup"],
): NarrationRewriteBlock {
	return {
		blockId,
		contentHtml: `<p>${blockId}</p>`,
		preparation,
	};
}

describe("htmlToNarrationText", () => {
	test("collapses block HTML to one spoken string and preserves citation text", () => {
		expect(
			htmlToNarrationText(
				'<p>First&nbsp;&amp; second.</p><p>Prior work <span class="inline-citation">[1]</span>.</p>',
			),
		).toBe("First & second. Prior work [1].");
	});
});

describe("buildNarrationGuideInput", () => {
	test("uses eligible Block text in order and reports truncation", () => {
		const input = buildNarrationGuideInput(["Alpha", "Beta", "Gamma"], 13);

		expect(input).toEqual({
			text: "Alpha\n\nBeta",
			truncated: true,
			inputCharCount: 18,
			includedBlockCount: 2,
		});
	});
});

describe("validateNarrationRewriteOutput", () => {
	test("maps valid rewrite output to Narration Text patches", () => {
		expect(
			validateNarrationRewriteOutput([rewriteBlock("a")], {
				blocks: [{ blockId: "a", text: " Rewritten text. " }],
			}),
		).toEqual([{ blockId: "a", text: "Rewritten text." }]);
	});

	test("rejects missing, duplicate, and unknown outputs", () => {
		const cases = [
			{
				blocks: [rewriteBlock("a"), rewriteBlock("b")],
				output: { blocks: [{ blockId: "a", text: "A" }] },
				message: /missed blockIds/,
			},
			{
				blocks: [rewriteBlock("a")],
				output: {
					blocks: [
						{ blockId: "a", text: "A" },
						{ blockId: "a", text: "Again" },
					],
				},
				message: /duplicated/,
			},
			{
				blocks: [rewriteBlock("a")],
				output: { blocks: [{ blockId: "missing", text: "A" }] },
				message: /unknown blockId/,
			},
		];

		for (const item of cases) {
			expect(() =>
				validateNarrationRewriteOutput(item.blocks, item.output),
			).toThrow(item.message);
		}
	});

	test("rejects empty or markup text", () => {
		const cases = [
			{ blocks: [{ blockId: "a", text: " " }], message: /empty/ },
			{ blocks: [{ blockId: "a", text: "<p>Text</p>" }], message: /markup/ },
		];

		for (const item of cases) {
			expect(() =>
				validateNarrationRewriteOutput([rewriteBlock("a")], {
					blocks: item.blocks,
				}),
			).toThrow(item.message);
		}
	});
});

describe("rewriteNarrationBlocks", () => {
	test("retries invalid batch outputs per Block", async () => {
		const calls: string[][] = [];
		const rewriteBatch: NarrationRewriteBatch = async (batch) => {
			calls.push(batch.map((block) => block.blockId));
			if (batch.length === 2) {
				return { blocks: [{ blockId: "a", text: "A" }] };
			}
			return {
				blocks: [{ blockId: batch[0].blockId, text: batch[0].blockId }],
			};
		};

		const result = await rewriteNarrationBlocks({
			blocks: [rewriteBlock("a"), rewriteBlock("b")],
			narrationGuide: "Guide",
			rewriteBatch,
			batchSize: 2,
		});

		expect(calls).toEqual([["a", "b"], ["a"], ["b"]]);
		expect(result).toEqual({
			texts: [
				{ blockId: "a", text: "a" },
				{ blockId: "b", text: "b" },
			],
			failedBlockIds: [],
		});
	});

	test("leaves individual retry failures without text", async () => {
		const rewriteBatch: NarrationRewriteBatch = async () => ({
			blocks: [{ blockId: "unknown", text: "A" }],
		});

		expect(
			await rewriteNarrationBlocks({
				blocks: [rewriteBlock("a")],
				narrationGuide: "Guide",
				rewriteBatch,
			}),
		).toEqual({ texts: [], failedBlockIds: ["a"] });
	});
});
