import { describe, expect, test } from "bun:test";
import type { BlockType } from "@academic-reader/shared/blocks";
import { prepareBlockContentHtml } from "./block-content";
import { deriveNarrationCandidate } from "./narration-candidates";

function block(input: { blockType?: BlockType; contentHtml: string }) {
	return {
		blockId: "block-1",
		blockType: input.blockType ?? "paragraph",
		contentHtml: input.contentHtml,
	};
}

describe("deriveNarrationCandidate", () => {
	test("hard-excludes empty Blocks", () => {
		expect(
			deriveNarrationCandidate(block({ contentHtml: "<p> </p>" })),
		).toEqual({
			kind: "hard-excluded",
			blockId: "block-1",
			narration: { decision: "ineligible", reason: "empty" },
		});
	});

	test("hard-excludes image-only Blocks", () => {
		expect(
			deriveNarrationCandidate(
				block({
					blockType: "figure",
					contentHtml: '<figure><img src="x.png"></figure>',
				}),
			),
		).toEqual({
			kind: "hard-excluded",
			blockId: "block-1",
			narration: { decision: "ineligible", reason: "image-only" },
		});
	});

	test("removes figure images and keeps prose", () => {
		const result = deriveNarrationCandidate(
			block({
				blockType: "figure",
				contentHtml:
					'<figure><img src="x.png"><figcaption>Growth curve.</figcaption></figure>',
			}),
		);

		expect(result).toMatchObject({ kind: "candidate" });
		if (result.kind !== "candidate") return;
		expect(result.candidateText).toBe(
			"<figure><figcaption>Growth curve.</figcaption></figure>",
		);
	});

	test("hard-excludes table-only Blocks", () => {
		expect(
			deriveNarrationCandidate(
				block({
					blockType: "table",
					contentHtml: "<table><tr><td>Value</td></tr></table>",
				}),
			),
		).toEqual({
			kind: "hard-excluded",
			blockId: "block-1",
			narration: { decision: "ineligible", reason: "table-only" },
		});
	});

	test("keeps prose outside table tags", () => {
		const result = deriveNarrationCandidate(
			block({
				blockType: "table",
				contentHtml:
					"<p>The table summarizes the conditions.</p><table><tr><td>Value</td></tr></table>",
			}),
		);

		expect(result).toMatchObject({ kind: "candidate" });
		if (result.kind !== "candidate") return;
		expect(result.candidateText).toBe(
			"<p>The table summarizes the conditions.</p>",
		);
	});

	test("hard-excludes only canonical page headers and footers", () => {
		const cases = [
			{ blockType: "pageHeader" as const, reason: "page-header" },
			{ blockType: "pageFooter" as const, reason: "page-footer" },
		];

		for (const item of cases) {
			expect(
				deriveNarrationCandidate(
					block({
						blockType: item.blockType,
						contentHtml: "<p>Running title</p>",
					}),
				),
			).toMatchObject({
				narration: { decision: "ineligible", reason: item.reason },
			});
		}
		expect(
			deriveNarrationCandidate(block({ contentHtml: "<p>Running title</p>" })),
		).toMatchObject({ kind: "candidate" });
	});

	test("hard-excludes code and form Blocks", () => {
		const cases = [
			{
				blockType: "code" as const,
				html: "<pre>const x = 1</pre>",
				reason: "code",
			},
			{ blockType: "form" as const, html: "<p>Name: ____</p>", reason: "form" },
		];

		for (const item of cases) {
			expect(
				deriveNarrationCandidate(
					block({ blockType: item.blockType, contentHtml: item.html }),
				),
			).toMatchObject({
				narration: { decision: "ineligible", reason: item.reason },
			});
		}
	});

	test("hard-excludes narrow DOI metadata", () => {
		expect(
			deriveNarrationCandidate(
				block({
					contentHtml: "<p>https://doi.org/10.1145/3306346.3323039</p>",
				}),
			),
		).toMatchObject({
			narration: { decision: "ineligible", reason: "doi" },
		});
		expect(
			deriveNarrationCandidate(
				block({
					contentHtml:
						"<p>0730-0301/2019/7-ART131 $15.00 https://doi.org/10.1145/3306346.3323039</p>",
				}),
			),
		).toMatchObject({
			narration: { decision: "ineligible", reason: "doi" },
		});
	});

	test("does not hard-exclude substantive DOI mentions", () => {
		expect(
			deriveNarrationCandidate(
				block({
					contentHtml:
						"<p>The replication package is archived at https://doi.org/10.1145/3306346.3323039 for independent verification.</p>",
				}),
			),
		).toMatchObject({ kind: "candidate" });
	});

	test("hard-excludes copyright boilerplate", () => {
		expect(
			deriveNarrationCandidate(
				block({
					contentHtml:
						"<p>Permission to make digital or hard copies is granted. Request permissions from permissions@example.com. © 2019 Association for Computing Machinery.</p>",
				}),
			),
		).toMatchObject({
			narration: { decision: "ineligible", reason: "copyright" },
		});
	});

	test("does not hard-exclude reference entries", () => {
		expect(
			deriveNarrationCandidate(
				block({ contentHtml: "<p>[1] Smith. A title.</p>" }),
			),
		).toMatchObject({ kind: "candidate" });
	});

	test("preserves inline citation spans", () => {
		const result = deriveNarrationCandidate(
			block({
				contentHtml:
					'<p>Prior work <span class="inline-citation">[Smith 2020]</span> shows this.</p>',
			}),
		);

		expect(result).toMatchObject({ kind: "candidate" });
		if (result.kind !== "candidate") return;
		expect(result.candidateText).toContain('class="inline-citation"');
		expect(result.features.hasInlineCitation).toBe(true);
	});

	test("collapses rendered KaTeX to compact math for Narration", () => {
		const result = deriveNarrationCandidate(
			block({
				contentHtml: prepareBlockContentHtml(
					"<p>Mass-energy equivalence is <math>E=mc^2</math>.</p>",
				),
			}),
		);

		expect(result).toMatchObject({ kind: "candidate" });
		if (result.kind !== "candidate") return;
		expect(result.candidateText).toBe(
			"<p>Mass-energy equivalence is <math>E=mc^2</math>.</p>",
		);
		expect(result.features.hasInlineMath).toBe(true);
		expect(result.candidateText).not.toContain("katex-html");
	});
});
