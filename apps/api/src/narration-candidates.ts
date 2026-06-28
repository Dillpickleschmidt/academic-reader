import type { BlockType } from "@academic-reader/shared/blocks";
import type {
	BlockNarration,
	HardIneligibleNarrationReason,
} from "@academic-reader/shared/narration";
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

export interface NarrationCandidateBlock {
	blockId: string;
	blockType: BlockType;
	contentHtml: string;
}

export type NarrationCandidateResult =
	| {
			kind: "hard-excluded";
			blockId: string;
			narration: Extract<BlockNarration, { decision: "ineligible" }>;
	  }
	| {
			kind: "candidate";
			blockId: string;
			candidateText: string;
			features: NarrationCandidateFeatures;
	  };

export interface NarrationCandidateFeatures {
	hasInlineCitation: boolean;
	hasInlineMath: boolean;
	isStandaloneEquation: boolean;
}

export function deriveNarrationCandidate(
	block: NarrationCandidateBlock,
): NarrationCandidateResult {
	const hardReason = hardReasonFromBlockType(block.blockType);
	if (hardReason) return hardExcluded(block.blockId, hardReason);

	const root = parseHtmlFragment(
		compactRenderedMathForNarrationHtml(block.contentHtml),
	);
	removeElements(
		root.children,
		(node) => node.name === "script" || node.name === "style",
	);

	const originalText = normalizedNodeText(root);
	const hadImage = hasElement(root, (node) => node.name === "img");

	if (!originalText) {
		return hardExcluded(block.blockId, hadImage ? "image-only" : "empty");
	}

	if (isDoiOnlyText(originalText)) return hardExcluded(block.blockId, "doi");
	if (isCopyrightBoilerplate(originalText)) {
		return hardExcluded(block.blockId, "copyright");
	}

	if (block.blockType === "table") {
		removeElements(root.children, (node) => node.name === "table");
		const tableOutsideText = normalizedNodeText(root);
		if (!tableOutsideText) return hardExcluded(block.blockId, "table-only");
		return candidate(block, root);
	}

	removeElements(root.children, (node) => node.name === "img");
	const textAfterImageRemoval = normalizedNodeText(root);
	if (!textAfterImageRemoval) {
		return hardExcluded(block.blockId, hadImage ? "image-only" : "empty");
	}

	return candidate(block, root);
}

function candidate(
	block: NarrationCandidateBlock,
	root: ReturnType<typeof parseHtmlFragment>,
): NarrationCandidateResult {
	return {
		kind: "candidate",
		blockId: block.blockId,
		candidateText: serializeNode(root).trim(),
		features: {
			hasInlineCitation: hasElement(
				root,
				(node) =>
					node.name === "span" && elementHasClass(node, "inline-citation"),
			),
			hasInlineMath: hasElement(root, (node) => node.name === "math"),
			isStandaloneEquation: block.blockType === "equation",
		},
	};
}

function hardExcluded(
	blockId: string,
	reason: HardIneligibleNarrationReason,
): NarrationCandidateResult {
	return {
		kind: "hard-excluded",
		blockId,
		narration: { decision: "ineligible", reason },
	};
}

function hardReasonFromBlockType(
	blockType: BlockType,
): HardIneligibleNarrationReason | undefined {
	if (blockType === "pageHeader") return "page-header";
	if (blockType === "pageFooter") return "page-footer";
	if (blockType === "code") return "code";
	if (blockType === "form") return "form";
	return undefined;
}

function normalizedNodeText(node: Parameters<typeof nodeTextContent>[0]) {
	return normalizeText(nodeTextContent(node));
}

function isDoiOnlyText(text: string) {
	const normalized = text.trim();
	if (/^(?:doi:\s*)?10\.\d{4,9}\/\S+$/i.test(normalized)) return true;
	if (/^https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/\S+$/i.test(normalized)) {
		return true;
	}
	if (
		!/\b(?:doi:\s*10\.|https?:\/\/(?:dx\.)?doi\.org\/10\.)/i.test(normalized)
	) {
		return false;
	}
	return (
		normalized.length <= 220 &&
		(/\$\d/.test(normalized) ||
			/^\d{4}-\d{3,4}\b/.test(normalized) ||
			/\b(?:issn|isbn|permissions?|copyright|acm|article)\b/i.test(normalized))
	);
}

function isCopyrightBoilerplate(text: string) {
	const normalized = text.toLowerCase();
	if (!/©|copyright|all rights reserved|permission to make/.test(normalized)) {
		return false;
	}
	return (
		normalized.includes("permission to make digital") ||
		normalized.includes("request permissions") ||
		normalized.includes("all rights reserved") ||
		normalized.includes("association for computing machinery") ||
		/^©\s*\d{4}\b/.test(text.trim())
	);
}
