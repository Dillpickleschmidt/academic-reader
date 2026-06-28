export type HtmlNode = ElementNode | RawNode | RootNode | TextNode;

export interface RootNode {
	kind: "root";
	children: HtmlNode[];
}

export interface ElementNode {
	kind: "element";
	name: string;
	rawOpen: string;
	rawClose?: string;
	children: HtmlNode[];
	selfClosing: boolean;
}

export interface TextNode {
	kind: "text";
	raw: string;
}

export interface RawNode {
	kind: "raw";
	raw: string;
}

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

export function parseHtmlFragment(html: string): RootNode {
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

export function serializeNode(node: HtmlNode): string {
	if (node.kind === "text" || node.kind === "raw") return node.raw;
	if (node.kind === "root") return node.children.map(serializeNode).join("");
	if (node.selfClosing) return node.rawOpen;
	return `${node.rawOpen}${node.children.map(serializeNode).join("")}${node.rawClose ?? ""}`;
}

export function nodeTextContent(node: HtmlNode): string {
	if (node.kind === "text") return node.raw;
	if (node.kind === "raw") return "";
	return node.children.map(nodeTextContent).join("");
}

export function elementHasClass(node: ElementNode, className: string) {
	const value = elementAttributeValue(node, "class");
	return value?.split(/\s+/).includes(className) ?? false;
}

export function elementAttributeValue(node: ElementNode, name: string) {
	return attributeValue(node.rawOpen, name);
}

export function hasElement(
	node: HtmlNode,
	predicate: (node: ElementNode) => boolean,
): boolean {
	if (node.kind !== "element" && node.kind !== "root") return false;
	if (node.kind === "element" && predicate(node)) return true;
	return node.children.some((child) => hasElement(child, predicate));
}

export function removeElements(
	children: HtmlNode[],
	predicate: (node: ElementNode) => boolean,
) {
	for (let index = children.length - 1; index >= 0; index -= 1) {
		const child = children[index];
		if (child.kind !== "element") continue;
		if (predicate(child)) {
			children.splice(index, 1);
			continue;
		}
		removeElements(child.children, predicate);
	}
}

export function normalizeText(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(text: string) {
	return text.replace(
		/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
		(match, entity) => {
			const normalized = String(entity).toLowerCase();
			if (normalized === "amp") return "&";
			if (normalized === "lt") return "<";
			if (normalized === "gt") return ">";
			if (normalized === "quot") return '"';
			if (normalized === "apos") return "'";
			if (normalized === "nbsp") return " ";
			if (normalized.startsWith("#x")) {
				return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
			}
			if (normalized.startsWith("#")) {
				return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
			}
			return match;
		},
	);
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
