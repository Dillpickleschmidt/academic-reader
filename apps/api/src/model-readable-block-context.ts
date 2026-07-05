import type { BlockType } from "@academic-reader/shared/blocks";
import { compactRenderedMathForNarrationHtml } from "./block-content";
import {
	elementHasClass,
	hasElement,
	nodeTextContent,
	normalizeText,
	parseHtmlFragment,
	removeElements,
	serializeNode,
} from "./html-fragment";

export interface ModelReadableBlockContextInput {
	blockId: string;
	blockType: BlockType;
	order?: number;
	pageNumber?: number;
	contentHtml: string;
}

export interface ModelReadableBlockContext {
	blockId: string;
	blockType: BlockType;
	order?: number;
	pageNumber?: number;
	contentHtml: string;
	plainText: string;
	features: ModelReadableBlockFeatures;
}

export interface ModelReadableBlockFeatures {
	hasImage: boolean;
	hasTable: boolean;
	hasInlineCitation: boolean;
	hasMath: boolean;
	isStandaloneEquation: boolean;
}

export function buildModelReadableBlockContext(
	block: ModelReadableBlockContextInput,
): ModelReadableBlockContext {
	const root = parseHtmlFragment(
		compactRenderedMathForNarrationHtml(block.contentHtml),
	);
	removeElements(
		root.children,
		(node) => node.name === "script" || node.name === "style",
	);

	const features = {
		hasImage: hasElement(root, (node) => node.name === "img"),
		hasTable: hasElement(root, (node) => node.name === "table"),
		hasInlineCitation: hasElement(
			root,
			(node) =>
				node.name === "span" && elementHasClass(node, "inline-citation"),
		),
		hasMath: hasElement(root, (node) => node.name === "math"),
		isStandaloneEquation: block.blockType === "equation",
	};

	removeElements(root.children, (node) => node.name === "img");

	return {
		blockId: block.blockId,
		blockType: block.blockType,
		...(block.order !== undefined ? { order: block.order } : {}),
		...(block.pageNumber !== undefined ? { pageNumber: block.pageNumber } : {}),
		contentHtml: serializeNode(root).trim(),
		plainText: normalizeText(nodeTextContent(root)),
		features,
	};
}
