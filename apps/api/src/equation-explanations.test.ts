import { describe, expect, test } from "bun:test";
import { validateEquationExplanationOutput } from "./equation-explanations";

describe("validateEquationExplanationOutput", () => {
	test("accepts script-capable HTML fragments", () => {
		expect(
			validateEquationExplanationOutput("eq-1", {
				blockId: "eq-1",
				contentHtml: "<h4>Idea</h4><p>Text</p><script>window.x = 1;</script>",
			}),
		).toEqual({
			blockId: "eq-1",
			contentHtml: "<h4>Idea</h4><p>Text</p><script>window.x = 1;</script>",
		});
	});

	test("rejects wrong block ids, empty content, and full documents", () => {
		expect(() =>
			validateEquationExplanationOutput("eq-1", {
				blockId: "eq-2",
				contentHtml: "<p>Text</p>",
			}),
		).toThrow(/wrong blockId/);
		expect(() =>
			validateEquationExplanationOutput("eq-1", {
				blockId: "eq-1",
				contentHtml: " ",
			}),
		).toThrow(/empty/);
		expect(() =>
			validateEquationExplanationOutput("eq-1", {
				blockId: "eq-1",
				contentHtml: "<html><body>Text</body></html>",
			}),
		).toThrow(/fragment/);
	});
});
