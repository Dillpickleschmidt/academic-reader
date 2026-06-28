import { describe, expect, test } from "bun:test";
import {
	markInlineCitationsInHtml,
	prepareBlockContentHtml,
	renderMathInHtml,
} from "./block-content";

describe("markInlineCitationsInHtml", () => {
	test("wraps bracketed numeric citations", () => {
		expect(
			markInlineCitationsInHtml("<p>See [1, 2; 4–6] for details.</p>"),
		).toBe(
			'<p>See <span class="inline-citation">[1, 2; 4–6]</span> for details.</p>',
		);
	});

	test("wraps bracketed author-year citations", () => {
		expect(
			markInlineCitationsInHtml("<p>See [Smith 2020] for details.</p>"),
		).toBe(
			'<p>See <span class="inline-citation">[Smith 2020]</span> for details.</p>',
		);
	});

	test("wraps grouped author-year citations", () => {
		const html =
			"<p>Plants are simulated using prior approaches [Deussen et al. 2002, 1998; Lane and Prusinkiewicz 2002].</p>";

		expect(markInlineCitationsInHtml(html)).toBe(
			'<p>Plants are simulated using prior approaches <span class="inline-citation">[Deussen et al. 2002, 1998; Lane and Prusinkiewicz 2002]</span>.</p>',
		);
	});

	test("wraps one citation split across adjacent inline links", () => {
		const html =
			'<p>Traditionally <a href="#page-12-0">[Deussen et al.</a> <a href="#page-12-0">2002,</a> <a href="#page-12-1">1998;</a> <a href="#page-12-2">Lane and Prusinkiewicz 2002]</a>.</p>';

		expect(markInlineCitationsInHtml(html)).toBe(
			'<p>Traditionally <span class="inline-citation"><a href="#page-12-0">[Deussen et al.</a> <a href="#page-12-0">2002,</a> <a href="#page-12-1">1998;</a> <a href="#page-12-2">Lane and Prusinkiewicz 2002]</a></span>.</p>',
		);
	});

	test("wraps around a linked citation", () => {
		expect(markInlineCitationsInHtml('<p>See <a href="#r1">[1]</a>.</p>')).toBe(
			'<p>See <span class="inline-citation"><a href="#r1">[1]</a></span>.</p>',
		);
	});

	test("does not double-wrap already marked inline citations", () => {
		const html = '<p><span class="inline-citation">[1]</span> and [2]</p>';

		expect(markInlineCitationsInHtml(html)).toBe(
			'<p><span class="inline-citation">[1]</span> and <span class="inline-citation">[2]</span></p>',
		);
	});

	test("does not double-wrap nested marked inline citations", () => {
		const html =
			'<p><strong><span class="inline-citation">[1]</span></strong> and [2]</p>';

		expect(markInlineCitationsInHtml(html)).toBe(
			'<p><strong><span class="inline-citation">[1]</span></strong> and <span class="inline-citation">[2]</span></p>',
		);
	});

	test("ignores non-citation bracketed text", () => {
		expect(markInlineCitationsInHtml("<p>This is [not a citation].</p>")).toBe(
			"<p>This is [not a citation].</p>",
		);
	});

	test("does not treat reference entries as one whole inline citation", () => {
		const output = markInlineCitationsInHtml("<p>[1] Smith. A title.</p>");

		expect(output).toBe(
			'<p><span class="inline-citation">[1]</span> Smith. A title.</p>',
		);
		expect(output).not.toContain("[1] Smith. A title.</span>");
	});
});

describe("renderMathInHtml", () => {
	test("renders inline math to KaTeX HTML with MathML", () => {
		const output = renderMathInHtml("<p>Mass <math>E=mc^2</math>.</p>");

		expect(output).toContain('class="katex"');
		expect(output).toContain(
			'<annotation encoding="application/x-tex">E=mc^2</annotation>',
		);
		expect(output).not.toContain("<math>E=mc^2</math>");
	});

	test("renders display math as KaTeX display HTML", () => {
		const output = renderMathInHtml(
			'<p><math display="block">\\int_0^1 x^2 dx</math></p>',
		);

		expect(output).toContain('class="katex-display"');
		expect(output).toContain(
			'<annotation encoding="application/x-tex">\\int_0^1 x^2 dx</annotation>',
		);
	});

	test("does not rerender existing KaTeX HTML", () => {
		const output = renderMathInHtml("<p>Mass <math>E=mc^2</math>.</p>");

		expect(renderMathInHtml(output)).toBe(output);
	});
});

describe("prepareBlockContentHtml", () => {
	test("marks Inline Citations and renders math in one Block HTML pass", () => {
		const output = prepareBlockContentHtml(
			"<p>See [1] and <math>x_{[1]}</math>.</p>",
		);

		const inlineCitationMatches =
			output.match(/class="inline-citation"/g) ?? [];

		expect(inlineCitationMatches).toHaveLength(1);
		expect(output).toContain('class="katex"');
		expect(output).toContain(
			'<annotation encoding="application/x-tex">x_{[1]}</annotation>',
		);
	});
});
