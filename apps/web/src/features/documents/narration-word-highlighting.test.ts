import { describe, expect, test } from "vitest";
import {
	buildNarrationHighlightRanges,
	seekMsForVisibleWord,
} from "./narration-word-highlighting";

function timestamps(words: string[]) {
	return words.map((word, index) => ({
		word,
		startMs: index * 100,
		endMs: index * 100 + 80,
	}));
}

describe("buildNarrationHighlightRanges", () => {
	test("maps exact visible and spoken words one-to-one", () => {
		expect(
			buildNarrationHighlightRanges(
				["This", "result", "works"],
				["This", "result", "works"],
			),
		).toEqual([
			{ start: 0, end: 0 },
			{ start: 1, end: 1 },
			{ start: 2, end: 2 },
		]);
	});

	test("maps a spoken rewrite gap to the visible gap between anchors", () => {
		expect(
			buildNarrationHighlightRanges(
				["This", "result", "[12]", "shows", "improvement"],
				[
					"This",
					"result",
					"from",
					"the",
					"cited",
					"paper",
					"shows",
					"improvement",
				],
			),
		).toEqual([
			{ start: 0, end: 0 },
			{ start: 1, end: 1 },
			{ start: 2, end: 2 },
			{ start: 2, end: 2 },
			{ start: 2, end: 2 },
			{ start: 2, end: 2 },
			{ start: 3, end: 3 },
			{ start: 4, end: 4 },
		]);
	});
});

describe("seekMsForVisibleWord", () => {
	test("seeks from a clicked visible gap to the first spoken word in that mapped gap", () => {
		const wordTimestamps = timestamps([
			"This",
			"result",
			"from",
			"the",
			"cited",
			"paper",
			"shows",
			"improvement",
		]);
		const ranges = buildNarrationHighlightRanges(
			["This", "result", "[12]", "shows", "improvement"],
			wordTimestamps.map((timestamp) => timestamp.word),
		);

		expect(
			seekMsForVisibleWord({
				visibleWordIndex: 2,
				ranges,
				wordTimestamps,
			}),
		).toBe(200);
	});

	test("falls back to the nearest mapped range", () => {
		const wordTimestamps = timestamps(["alpha", "omega"]);
		const ranges = buildNarrationHighlightRanges(
			["alpha", "unspoken", "omega"],
			wordTimestamps.map((timestamp) => timestamp.word),
		);

		expect(
			seekMsForVisibleWord({
				visibleWordIndex: 1,
				ranges,
				wordTimestamps,
			}),
		).toBe(0);
	});

	test("returns undefined when no spoken words map to visible words", () => {
		const wordTimestamps = timestamps(["spoken"]);
		const ranges = buildNarrationHighlightRanges(
			["visible"],
			wordTimestamps.map((timestamp) => timestamp.word),
		);

		expect(
			seekMsForVisibleWord({
				visibleWordIndex: 0,
				ranges,
				wordTimestamps,
			}),
		).toBeUndefined();
	});
});
