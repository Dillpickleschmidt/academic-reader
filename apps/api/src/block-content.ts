type HtmlNode = ElementNode | RawNode | RootNode | TextNode;

interface RootNode {
	kind: "root";
	children: HtmlNode[];
}

interface ElementNode {
	kind: "element";
	name: string;
	rawOpen: string;
	rawClose?: string;
	children: HtmlNode[];
	selfClosing: boolean;
}

interface TextNode {
	kind: "text";
	raw: string;
}

interface RawNode {
	kind: "raw";
	raw: string;
}

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
	"code",
	"pre",
	"script",
	"style",
	"textarea",
]);

const voidElementNames = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

export function markInlineCitationsInHtml(html: string) {
	if (!html.includes("[") || !html.includes("]")) return html;

	const root = parseHtmlFragment(html);
	markInlineCitationsInChildren(root.children);
	return serializeNode(root);
}

function parseHtmlFragment(html: string): RootNode {
	const root: RootNode = { kind: "root", children: [] };
	const stack: Array<RootNode | ElementNode> = [root];
	const tagPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>/g;
	let lastIndex = 0;
	let match = tagPattern.exec(html);

	while (match) {
		if (match.index > lastIndex) {
			currentParent(stack).children.push({
				kind: "text",
				raw: html.slice(lastIndex, match.index),
			});
		}

		appendHtmlTagToken(stack, match[0]);
		lastIndex = match.index + match[0].length;
		match = tagPattern.exec(html);
	}

	if (lastIndex < html.length) {
		currentParent(stack).children.push({
			kind: "text",
			raw: html.slice(lastIndex),
		});
	}

	return root;
}

function appendHtmlTagToken(stack: Array<RootNode | ElementNode>, raw: string) {
	const closingName = closingTagName(raw);
	if (closingName) {
		const parent = currentParent(stack);
		if (parent.kind === "element" && parent.name === closingName) {
			parent.rawClose = raw;
			stack.pop();
		} else {
			parent.children.push({ kind: "raw", raw });
		}
		return;
	}

	const openingName = openingTagName(raw);
	if (!openingName) {
		currentParent(stack).children.push({ kind: "raw", raw });
		return;
	}

	const selfClosing = /\/\s*>$/.test(raw) || voidElementNames.has(openingName);
	const element: ElementNode = {
		kind: "element",
		name: openingName,
		rawOpen: raw,
		children: [],
		selfClosing,
	};
	currentParent(stack).children.push(element);
	if (!selfClosing) stack.push(element);
}

function currentParent(stack: Array<RootNode | ElementNode>) {
	return stack[stack.length - 1];
}

function markInlineCitationsInChildren(children: HtmlNode[]) {
	wrapCitationRuns(children);

	for (const child of children) {
		if (child.kind !== "element") continue;
		if (
			child.name === "a" ||
			isInlineCitationElement(child) ||
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
		isExcludedElement(node) ||
		containsInlineCitationElement(node)
	) {
		return true;
	}
	if (blockElementNames.has(node.name)) return true;
	return nodeTextContent(node).length === 0;
}

function nodeTextContent(node: HtmlNode): string {
	if (node.kind === "text") return node.raw;
	if (node.kind === "raw") return "";
	return node.children.map(nodeTextContent).join("");
}

function serializeNode(node: HtmlNode): string {
	if (node.kind === "text" || node.kind === "raw") return node.raw;
	if (node.kind === "root") return node.children.map(serializeNode).join("");
	if (node.selfClosing) return node.rawOpen;
	return `${node.rawOpen}${node.children.map(serializeNode).join("")}${node.rawClose ?? ""}`;
}

function isInlineCitationElement(node: ElementNode) {
	return (
		node.name === "span" && elementHasClass(node.rawOpen, "inline-citation")
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

function elementHasClass(rawOpen: string, className: string) {
	const value = attributeValue(rawOpen, "class");
	return value?.split(/\s+/).includes(className) ?? false;
}

function attributeValue(rawOpen: string, name: string) {
	const pattern = new RegExp(
		`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
		"i",
	);
	const match = rawOpen.match(pattern);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function openingTagName(raw: string) {
	if (/^<\s*\//.test(raw) || /^<!/.test(raw)) return undefined;
	return raw.match(/^<\s*([A-Za-z][^\s/>]*)/)?.[1]?.toLowerCase();
}

function closingTagName(raw: string) {
	return raw.match(/^<\s*\/\s*([A-Za-z][^\s>]*)/)?.[1]?.toLowerCase();
}
