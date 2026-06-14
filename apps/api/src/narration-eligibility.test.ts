import { describe, expect, test } from "bun:test";
import {
	type EligibilityReviewBatch,
	type NarrationEligibilityCandidate,
	reviewEligibilityCandidates,
	validateEligibilityReviewOutput,
} from "./narration-eligibility";

function candidate(
	blockId: string,
	features: Partial<NarrationEligibilityCandidate["features"]> = {},
): NarrationEligibilityCandidate {
	return {
		blockId,
		candidateText: `<p>${blockId}</p>`,
		features: {
			hasInlineCitation: false,
			hasInlineMath: false,
			isStandaloneEquation: false,
			...features,
		},
	};
}

describe("validateEligibilityReviewOutput", () => {
	test("maps valid flat review output to persisted narration", () => {
		expect(
			validateEligibilityReviewOutput([candidate("a"), candidate("b")], {
				blocks: [
					{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					{
						blockId: "b",
						decision: "ineligible",
						reason: "reference-entry",
					},
				],
			}),
		).toEqual([
			{
				blockId: "a",
				narration: { decision: "eligible", preparation: ["plain"] },
			},
			{
				blockId: "b",
				narration: { decision: "ineligible", reason: "reference-entry" },
			},
		]);
	});

	test("rejects missing, duplicate, and unknown outputs", () => {
		const cases = [
			{
				candidates: [candidate("a"), candidate("b")],
				output: {
					blocks: [
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					],
				},
				message: /missed blockIds/,
			},
			{
				candidates: [candidate("a")],
				output: {
					blocks: [
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					],
				},
				message: /duplicated/,
			},
			{
				candidates: [candidate("a")],
				output: {
					blocks: [
						{
							blockId: "missing",
							decision: "eligible",
							preparation: ["plain"],
						},
					],
				},
				message: /unknown blockId/,
			},
		];

		for (const item of cases) {
			expect(() =>
				validateEligibilityReviewOutput(item.candidates, item.output),
			).toThrow(item.message);
		}
	});

	test("rejects plain combined with other preparation tags", () => {
		expect(() =>
			validateEligibilityReviewOutput([candidate("a")], {
				blocks: [
					{
						blockId: "a",
						decision: "eligible",
						preparation: ["plain", "inline-math"],
					},
				],
			}),
		).toThrow(/combines plain/);
	});

	test("requires citation cleanup for citation-bearing eligible candidates", () => {
		expect(() =>
			validateEligibilityReviewOutput(
				[candidate("a", { hasInlineCitation: true })],
				{
					blocks: [
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					],
				},
			),
		).toThrow(/inline-citation-cleanup/);
	});

	test("requires inline math preparation for inline math candidates", () => {
		expect(() =>
			validateEligibilityReviewOutput(
				[candidate("a", { hasInlineMath: true })],
				{
					blocks: [
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					],
				},
			),
		).toThrow(/inline-math/);
	});

	test("requires standalone equation candidates to be eligible with equation explanation", () => {
		expect(() =>
			validateEligibilityReviewOutput(
				[candidate("a", { isStandaloneEquation: true })],
				{
					blocks: [
						{
							blockId: "a",
							decision: "ineligible",
							reason: "unknown-noise",
						},
					],
				},
			),
		).toThrow(/must be eligible/);
		expect(() =>
			validateEligibilityReviewOutput(
				[candidate("a", { isStandaloneEquation: true })],
				{
					blocks: [
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					],
				},
			),
		).toThrow(/equation-explanation/);
	});
});

describe("reviewEligibilityCandidates", () => {
	test("retries invalid batch outputs per Block", async () => {
		const calls: string[][] = [];
		const reviewBatch: EligibilityReviewBatch = async (batch) => {
			calls.push(batch.map((item) => item.blockId));
			if (batch.length === 2) {
				return {
					blocks: [
						{ blockId: "a", decision: "eligible", preparation: ["plain"] },
					],
				};
			}
			return {
				blocks: [
					{
						blockId: batch[0].blockId,
						decision: "eligible",
						preparation: ["plain"],
					},
				],
			};
		};

		const decisions = await reviewEligibilityCandidates({
			candidates: [candidate("a"), candidate("b")],
			reviewBatch,
			batchSize: 2,
		});

		expect(calls).toEqual([["a", "b"], ["a"], ["b"]]);
		expect(decisions).toEqual([
			{
				blockId: "a",
				narration: { decision: "eligible", preparation: ["plain"] },
			},
			{
				blockId: "b",
				narration: { decision: "eligible", preparation: ["plain"] },
			},
		]);
	});

	test("persists review-failed for invalid individual retry", async () => {
		const reviewBatch: EligibilityReviewBatch = async () => ({
			blocks: [
				{ blockId: "unknown", decision: "eligible", preparation: ["plain"] },
			],
		});

		expect(
			await reviewEligibilityCandidates({
				candidates: [candidate("a")],
				reviewBatch,
			}),
		).toEqual([
			{
				blockId: "a",
				narration: { decision: "ineligible", reason: "review-failed" },
			},
		]);
	});
});
