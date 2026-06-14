import { Buffer } from "node:buffer";
import {
	markerBlockType,
	type BlockType,
} from "@academic-reader/shared/blocks";

export interface MarkerConversionResult {
	content: string;
	metadata: Record<string, unknown>;
	formats: {
		html: string;
		markdown: string;
		chunks: MarkerChunkOutput | null;
	};
	images: Record<string, string> | null;
}

export interface PageInput {
	physicalPageNumber: number;
	width: number;
	height: number;
}

export interface BlockInput {
	blockId: string;
	blockType: BlockType;
	rawBlockType: string;
	order: number;
	contentHtml: string;
	contentMarkdown?: string;
	pageNumber?: number;
	normalizedBoundingBox?: {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

interface MarkerChunkOutput {
	blocks?: unknown[];
	page_info?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

interface MarkerBlock {
	id: string;
	block_type: string;
	html: string;
	markerPageId?: number;
	bbox?: number[];
}

export function normalizeMarkerConversionResult(
	value: unknown,
): MarkerConversionResult {
	if (!isRecord(value)) throw new Error("Marker result is not an object");
	if (typeof value.content !== "string") {
		throw new Error("Marker result is missing content");
	}
	if (!isRecord(value.metadata)) {
		throw new Error("Marker result is missing metadata");
	}
	if (!isRecord(value.formats)) {
		throw new Error("Marker result is missing formats");
	}
	if (typeof value.formats.html !== "string") {
		throw new Error("Marker result is missing HTML");
	}
	if (typeof value.formats.markdown !== "string") {
		throw new Error("Marker result is missing markdown");
	}

	return {
		content: value.content,
		metadata: value.metadata,
		formats: {
			html: value.formats.html,
			markdown: value.formats.markdown,
			chunks: normalizeChunks(value.formats.chunks),
		},
		images: normalizeImages(value.images),
	};
}

export function collectMarkerImages(result: MarkerConversionResult) {
	const images: Record<string, string> = { ...(result.images ?? {}) };

	for (const block of result.formats.chunks?.blocks ?? []) {
		if (!isRecord(block) || !isRecord(block.images)) continue;
		for (const [filename, image] of Object.entries(block.images)) {
			if (typeof image === "string") images[filename] = image;
		}
	}

	return images;
}

export function adaptMarkerConversionResult(input: {
	result: MarkerConversionResult;
	imageUrls: Record<string, string>;
}) {
	const warnings: string[] = [];
	const chunks = input.result.formats.chunks;
	const pageDimensionsByMarkerPageId = new Map<
		number,
		{ width: number; height: number }
	>();
	const pages: PageInput[] = [];

	if (!chunks) {
		throw new Error("Marker result did not include chunks");
	}

	for (const [rawPageId, pageInfo] of Object.entries(chunks.page_info ?? {})) {
		const pageId = Number(rawPageId);
		if (!Number.isInteger(pageId)) {
			warnings.push(`Ignored Marker page_info key ${rawPageId}`);
			continue;
		}

		const bbox = isRecord(pageInfo) ? numberArray(pageInfo.bbox) : null;
		if (!bbox || bbox.length < 4) {
			warnings.push(`Page ${pageId + 1} is missing page dimensions`);
			continue;
		}

		const width = bbox[2] - bbox[0];
		const height = bbox[3] - bbox[1];
		if (
			!Number.isFinite(width) ||
			!Number.isFinite(height) ||
			width <= 0 ||
			height <= 0
		) {
			warnings.push(`Page ${pageId + 1} has invalid page dimensions`);
			continue;
		}

		pageDimensionsByMarkerPageId.set(pageId, { width, height });
		pages.push({
			physicalPageNumber: pageId + 1,
			width,
			height,
		});
	}

	const rawBlocks = chunks.blocks ?? [];
	if (!Array.isArray(rawBlocks)) {
		throw new Error("Marker chunks.blocks must be an array");
	}

	const referencedImages = new Set<string>();
	const blocks: BlockInput[] = [];

	for (const [index, rawBlock] of rawBlocks.entries()) {
		const block = normalizeMarkerBlock(rawBlock, index, warnings);
		if (!block) continue;

		const rewrite = rewriteImageSources(block.html, input.imageUrls);
		for (const src of rewrite.referencedImages) referencedImages.add(src);
		warnings.push(
			...rewrite.warnings.map((warning) => `${block.id}: ${warning}`),
		);

		const pageNumber =
			block.markerPageId === undefined ? undefined : block.markerPageId + 1;
		const normalizedBoundingBox = normalizeBoundingBox({
			bbox: block.bbox,
			markerPageId: block.markerPageId,
			pageDimensionsByMarkerPageId,
			warnings,
			blockId: block.id,
		});

		blocks.push({
			blockId: block.id,
			blockType: markerBlockType(block.block_type),
			rawBlockType: block.block_type,
			order: blocks.length,
			contentHtml: rewrite.html,
			...(pageNumber !== undefined ? { pageNumber } : {}),
			...(normalizedBoundingBox ? { normalizedBoundingBox } : {}),
		});
	}

	for (const imageName of Object.keys(input.imageUrls)) {
		if (!referencedImages.has(imageName)) {
			warnings.push(
				`Image ${imageName} was returned but not referenced by a Block`,
			);
		}
	}

	if (!pages.length) throw new Error("Marker result did not include any Pages");
	if (!blocks.length)
		throw new Error("Marker result did not include any Blocks");

	return {
		pages: pages.sort((a, b) => a.physicalPageNumber - b.physicalPageNumber),
		blocks,
		warnings,
	};
}

export function decodeBase64Image(base64: string) {
	const [, encoded] = base64.match(/^data:[^;]+;base64,(.*)$/) ?? [];
	return Buffer.from(encoded ?? base64, "base64");
}

function normalizeChunks(value: unknown): MarkerChunkOutput | null {
	if (value === null || value === undefined) return null;
	if (!isRecord(value)) throw new Error("Marker chunks must be an object");
	if (value.blocks !== undefined && !Array.isArray(value.blocks)) {
		throw new Error("Marker chunks.blocks must be an array");
	}
	if (value.page_info !== undefined && !isRecord(value.page_info)) {
		throw new Error("Marker chunks.page_info must be an object");
	}

	return {
		...(value.blocks !== undefined ? { blocks: value.blocks } : {}),
		...(value.page_info !== undefined ? { page_info: value.page_info } : {}),
		...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
	};
}

function normalizeImages(value: unknown): Record<string, string> | null {
	if (value === null || value === undefined) return null;
	if (!isRecord(value)) throw new Error("Marker images must be an object");

	const images: Record<string, string> = {};
	for (const [key, image] of Object.entries(value)) {
		if (typeof image !== "string") {
			throw new Error(`Marker image ${key} must be a base64 string`);
		}
		images[key] = image;
	}
	return images;
}

function normalizeMarkerBlock(
	value: unknown,
	index: number,
	warnings: string[],
): MarkerBlock | null {
	if (!isRecord(value)) {
		warnings.push(`Ignored non-object block at index ${index}`);
		return null;
	}
	if (typeof value.html !== "string" || value.html.trim().length === 0) {
		warnings.push(`Ignored block at index ${index} without HTML`);
		return null;
	}

	const id =
		typeof value.id === "string" && value.id ? value.id : `marker-${index}`;
	if (id === `marker-${index}`)
		warnings.push(`Block ${index} is missing an id`);
	const markerPageId = markerPageIdFromBlockId(id);

	return {
		id,
		block_type:
			typeof value.block_type === "string" ? value.block_type : "Unknown",
		html: value.html,
		...(markerPageId !== undefined ? { markerPageId } : {}),
		...(numberArray(value.bbox)
			? { bbox: numberArray(value.bbox) ?? undefined }
			: {}),
	};
}

function markerPageIdFromBlockId(blockId: string) {
	const [, pageId] = blockId.match(/^\/page\/(\d+)(?:\/|$)/) ?? [];
	if (pageId === undefined) return undefined;
	return Number(pageId);
}

function normalizeBoundingBox(input: {
	bbox: number[] | undefined;
	markerPageId: number | undefined;
	pageDimensionsByMarkerPageId: Map<number, { width: number; height: number }>;
	warnings: string[];
	blockId: string;
}) {
	if (!input.bbox) return undefined;
	if (input.bbox.length < 4) {
		input.warnings.push(`${input.blockId}: bbox must have four coordinates`);
		return undefined;
	}
	if (input.markerPageId === undefined) {
		input.warnings.push(
			`${input.blockId}: bbox ignored because Marker block id is missing a page path`,
		);
		return undefined;
	}
	const page = input.pageDimensionsByMarkerPageId.get(input.markerPageId);
	if (!page) {
		input.warnings.push(
			`${input.blockId}: bbox ignored because page dimensions are missing`,
		);
		return undefined;
	}

	const [left, top, right, bottom] = input.bbox;
	const width = right - left;
	const height = bottom - top;
	if (width <= 0 || height <= 0) {
		input.warnings.push(`${input.blockId}: bbox has invalid dimensions`);
		return undefined;
	}

	return {
		left: left / page.width,
		top: top / page.height,
		width: width / page.width,
		height: height / page.height,
	};
}

function rewriteImageSources(html: string, imageUrls: Record<string, string>) {
	const warnings: string[] = [];
	const referencedImages = new Set<string>();
	const rewritten = html.replace(
		/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi,
		(match, prefix: string, quote: string, src: string) => {
			if (
				src.startsWith("data:") ||
				src.startsWith("http://") ||
				src.startsWith("https://") ||
				src.startsWith("/api/")
			) {
				return match;
			}

			referencedImages.add(src);
			const url = imageUrls[src];
			if (!url) {
				warnings.push(
					`image ${src} is referenced but missing from Marker images`,
				);
				return match;
			}

			return `${prefix}${quote}${url}${quote}`;
		},
	);

	return { html: rewritten, warnings, referencedImages };
}

function numberArray(value: unknown) {
	if (!Array.isArray(value)) return null;
	const numbers = value.filter(
		(item): item is number => typeof item === "number" && Number.isFinite(item),
	);
	return numbers.length === value.length ? numbers : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
