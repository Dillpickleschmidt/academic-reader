import katex from "katex";
import {
	decodeHtmlEntities,
	type ElementNode,
	elementAttributeValue,
	elementHasClass,
	type HtmlNode,
	nodeTextContent,
	parseHtmlFragment,
	serializeNode,
} from "./html-fragment";

interface CitationMatch {
	start: number;
	end: number;
}

const citationPattern = /\[(?:[A-Z][^\]]{0,100}\d{4}|[\d,;\s\-–]{1,50})\]/g;

const blockElementNames = new Set([
	"address",
	"article",
	"aside",
	"blockquote",
	"body",
	"br",
	"caption",
	"col",
	"colgroup",
	"dd",
	"div",
	"dl",
	"dt",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"hr",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"pre",
	"section",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"ul",
]);

const excludedElementNames = new Set([
	"annotation",
	"code",
	"math",
	"pre",
	"script",
	"semantics",
	"style",
	"textarea",
]);

export function prepareBlockContentHtml(html: string) {
	return renderMathInHtml(markInlineCitationsInHtml(html));
}

export function renderMathInHtml(html: string) {
	if (!html.includes("<math")) return html;

	const root = parseHtmlFragment(html);
	renderMathInChildren(root.children);
	return serializeNode(root);
}

export function markInlineCitationsInHtml(html: string) {
	if (!html.includes("[") || !html.includes("]")) return html;

	const root = parseHtmlFragment(html);
	markInlineCitationsInChildren(root.children);
	return serializeNode(root);
}

export function compactRenderedMathForNarrationHtml(html: string) {
	if (!html.includes("katex")) return html;

	const root = parseHtmlFragment(html);
	compactRenderedMathInChildren(root.children);
	return serializeNode(root);
}

function renderMathInChildren(children: HtmlNode[]) {
	for (const [index, child] of children.entries()) {
		if (child.kind !== "element" || isRenderedMathElement(child)) continue;
		if (child.name === "math") {
			children[index] = renderMathElement(child);
			continue;
		}
		renderMathInChildren(child.children);
	}
}

function renderMathElement(node: ElementNode): HtmlNode {
	const latex = decodeHtmlEntities(nodeTextContent(node)).trim();
	if (!latex) return node;

	try {
		return {
			kind: "raw",
			raw: katex.renderToString(latex, {
				throwOnError: false,
				displayMode: elementAttributeValue(node, "display") === "block",
				output: "htmlAndMathml",
			}),
		};
	} catch {
		return node;
	}
}

function compactRenderedMathInChildren(children: HtmlNode[]) {
	for (const [index, child] of children.entries()) {
		if (child.kind !== "element") continue;
		if (isRenderedMathElement(child)) {
			children[index] = renderedMathNarrationNode(child);
			continue;
		}
		compactRenderedMathInChildren(child.children);
	}
}

function renderedMathNarrationNode(node: ElementNode): HtmlNode {
	const latex = decodeHtmlEntities(
		findMathAnnotationText(node) ?? nodeTextContent(node),
	).trim();
	if (!latex) return node;

	return {
		kind: "raw",
		raw: `<math${elementHasClass(node, "katex-display") ? ' display="block"' : ""}>${escapeHtml(latex)}</math>`,
	};
}

function findMathAnnotationText(node: HtmlNode): string | undefined {
	if (node.kind !== "element" && node.kind !== "root") return undefined;
	if (
		node.kind === "element" &&
		node.name === "annotation" &&
		elementAttributeValue(node, "encoding")?.toLowerCase() ===
			"application/x-tex"
	) {
		return nodeTextContent(node);
	}

	for (const child of node.children) {
		const text = findMathAnnotationText(child);
		if (text !== undefined) return text;
	}
	return undefined;
}

function escapeHtml(text: string) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function markInlineCitationsInChildren(children: HtmlNode[]) {
	wrapCitationRuns(children);

	for (const child of children) {
		if (child.kind !== "element") continue;
		if (
			child.name === "a" ||
			isInlineCitationElement(child) ||
			isRenderedMathElement(child) ||
			isExcludedElement(child)
		) {
			continue;
		}
		markInlineCitationsInChildren(child.children);
	}
}

function wrapCitationRuns(children: HtmlNode[]) {
	let index = 0;

	while (index < children.length) {
		while (index < children.length && isRunBoundary(children[index]))
			index += 1;
		const start = index;
		while (index < children.length && !isRunBoundary(children[index]))
			index += 1;
		const end = index;

		if (end > start) {
			const wrapped = wrapCitationRun(children.slice(start, end));
			children.splice(start, end - start, ...wrapped);
			index = start + wrapped.length;
		}
	}
}

function wrapCitationRun(children: HtmlNode[]) {
	const childTexts = children.map(nodeTextContent);
	const text = childTexts.join("");
	if (!text.includes("[") || !text.includes("]")) return children;

	const matches = citationMatches(text).filter((match) =>
		isRepresentableMatch(children, childTexts, match),
	);
	if (!matches.length) return children;

	const boundaryPositions = new Set<number>();
	for (const match of matches) {
		boundaryPositions.add(match.start);
		boundaryPositions.add(match.end);
	}

	const { boundaryIndexes, segments } = splitRunAtBoundaries(
		children,
		childTexts,
		boundaryPositions,
	);
	const segmentMatches = matches.flatMap((match) => {
		const startSegment = boundaryIndexes.get(match.start);
		const endSegment = boundaryIndexes.get(match.end);
		if (startSegment === undefined || endSegment === undefined) return [];
		if (endSegment <= startSegment) return [];
		return [{ startSegment, endSegment }];
	});

	return wrapSegments(segments, segmentMatches);
}

function citationMatches(text: string): CitationMatch[] {
	const matches: CitationMatch[] = [];
	citationPattern.lastIndex = 0;
	let match = citationPattern.exec(text);

	while (match) {
		matches.push({ start: match.index, end: match.index + match[0].length });
		match = citationPattern.exec(text);
	}

	return matches;
}

function isRepresentableMatch(
	children: HtmlNode[],
	childTexts: string[],
	match: CitationMatch,
) {
	return (
		isRepresentableBoundary(children, childTexts, match.start) &&
		isRepresentableBoundary(children, childTexts, match.end)
	);
}

function isRepresentableBoundary(
	children: HtmlNode[],
	childTexts: string[],
	position: number,
) {
	let cursor = 0;

	for (const [index, child] of children.entries()) {
		const length = childTexts[index].length;
		if (position === cursor || position === cursor + length) return true;
		if (position > cursor && position < cursor + length) {
			return child.kind === "text";
		}
		cursor += length;
	}

	return position === cursor;
}

function splitRunAtBoundaries(
	children: HtmlNode[],
	childTexts: string[],
	boundaryPositions: Set<number>,
) {
	const segments: HtmlNode[] = [];
	const boundaryIndexes = new Map<number, number>();
	let cursor = 0;

	for (const [index, child] of children.entries()) {
		const length = childTexts[index].length;
		if (child.kind === "text") {
			const cuts = Array.from(
				new Set([
					0,
					length,
					...Array.from(boundaryPositions)
						.filter(
							(position) => position > cursor && position < cursor + length,
						)
						.map((position) => position - cursor),
				]),
			).sort((a, b) => a - b);

			for (const [cutIndex, cut] of cuts.entries()) {
				boundaryIndexes.set(cursor + cut, segments.length);
				const nextCut = cuts[cutIndex + 1];
				if (nextCut !== undefined && nextCut > cut) {
					segments.push({
						kind: "text",
						raw: child.raw.slice(cut, nextCut),
					});
				}
			}
		} else {
			boundaryIndexes.set(cursor, segments.length);
			segments.push(child);
			boundaryIndexes.set(cursor + length, segments.length);
		}
		cursor += length;
	}

	return { boundaryIndexes, segments };
}

function wrapSegments(
	segments: HtmlNode[],
	matches: Array<{ startSegment: number; endSegment: number }>,
) {
	const wrapped: HtmlNode[] = [];
	let cursor = 0;

	for (const match of matches) {
		if (match.startSegment < cursor) continue;
		wrapped.push(...segments.slice(cursor, match.startSegment));
		wrapped.push(
			inlineCitationElement(
				segments.slice(match.startSegment, match.endSegment),
			),
		);
		cursor = match.endSegment;
	}

	wrapped.push(...segments.slice(cursor));
	return wrapped;
}

function inlineCitationElement(children: HtmlNode[]): ElementNode {
	return {
		kind: "element",
		name: "span",
		rawOpen: '<span class="inline-citation">',
		rawClose: "</span>",
		children,
		selfClosing: false,
	};
}

function isRunBoundary(node: HtmlNode) {
	if (node.kind === "raw") return true;
	if (node.kind === "text") return false;
	if (node.kind === "root") return false;
	if (
		isInlineCitationElement(node) ||
		isRenderedMathElement(node) ||
		isExcludedElement(node) ||
		containsInlineCitationElement(node)
	) {
		return true;
	}
	if (blockElementNames.has(node.name)) return true;
	return nodeTextContent(node).length === 0;
}

function isInlineCitationElement(node: ElementNode) {
	return node.name === "span" && elementHasClass(node, "inline-citation");
}

function isRenderedMathElement(node: ElementNode) {
	return (
		node.name === "span" &&
		(elementHasClass(node, "katex") || elementHasClass(node, "katex-display"))
	);
}

function containsInlineCitationElement(node: ElementNode): boolean {
	return (
		isInlineCitationElement(node) ||
		node.children.some(
			(child) =>
				child.kind === "element" && containsInlineCitationElement(child),
		)
	);
}

function isExcludedElement(node: ElementNode) {
	return excludedElementNames.has(node.name);
}
