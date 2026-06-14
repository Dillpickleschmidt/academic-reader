import { describe, expect, test } from "bun:test";
import { markInlineCitationsInHtml } from "./block-content";

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
