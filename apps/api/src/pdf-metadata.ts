import {
	getDocument,
	type PDFDocumentProxy,
	type PageViewport,
} from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfMetadataBlockCandidate {
	blockId: string;
	pageNumber?: number;
	normalizedBoundingBox?: {
		left: number;
		top: number;
		width: number;
		height: number;
	};
}

export interface PdfTableOfContentsEntryInput {
	order: number;
	depth: number;
	title: string;
	target?: {
		physicalPageNumber: number;
		blockId?: string;
		sourcePoint?: {
			left: number;
			top: number;
		};
	};
}

export interface PdfPageLabelsAndOutline {
	pageLabelsByPhysicalPageNumber: Map<number, string>;
	tableOfContentsEntries: PdfTableOfContentsEntryInput[];
}

interface PdfOutlineItem {
	title?: unknown;
	dest?: unknown;
	items?: unknown;
}

interface NormalizedSourcePoint {
	left: number;
	top: number;
}

type DestinationPoint =
	| { kind: "point"; sourcePoint: NormalizedSourcePoint }
	| { kind: "vertical"; top: number };

type PdfPageRef = { num: number; gen: number };

const maxTopEdgeDistancePoints = 24;
const topEdgeTieDistancePoints = 2;
const pointMatchEpsilon = 1e-6;

export async function extractPdfPageLabelsAndOutline(input: {
	bytes: Uint8Array;
	blocks: PdfMetadataBlockCandidate[];
}): Promise<PdfPageLabelsAndOutline> {
	const loadingTask = getDocument({ data: input.bytes });
	const pdfDocument = await loadingTask.promise;

	try {
		const pageLabels = await pdfDocument.getPageLabels();
		return {
			pageLabelsByPhysicalPageNumber:
				pageLabelsByPhysicalPageNumber(pageLabels),
			tableOfContentsEntries: await tableOfContentsEntriesFromPdfOutline({
				blocks: input.blocks,
				pdfDocument,
			}),
		};
	} finally {
		await pdfDocument.cleanup();
	}
}

function pageLabelsByPhysicalPageNumber(labels: string[] | null) {
	const labelsByPage = new Map<number, string>();
	for (const [index, label] of (labels ?? []).entries()) {
		const trimmed = label.trim();
		if (trimmed) labelsByPage.set(index + 1, trimmed);
	}
	return labelsByPage;
}

async function tableOfContentsEntriesFromPdfOutline(input: {
	pdfDocument: PDFDocumentProxy;
	blocks: PdfMetadataBlockCandidate[];
}) {
	const outline = await input.pdfDocument.getOutline();
	const entries: PdfTableOfContentsEntryInput[] = [];
	if (!Array.isArray(outline)) return entries;

	await appendPdfOutlineItems({
		blocks: input.blocks,
		depth: 0,
		entries,
		items: outline,
		pdfDocument: input.pdfDocument,
		viewportsByPhysicalPageNumber: new Map(),
	});
	return entries;
}

async function appendPdfOutlineItems(input: {
	pdfDocument: PDFDocumentProxy;
	blocks: PdfMetadataBlockCandidate[];
	items: unknown[];
	entries: PdfTableOfContentsEntryInput[];
	depth: number;
	viewportsByPhysicalPageNumber: Map<number, PageViewport>;
}) {
	for (const rawItem of input.items) {
		if (!isRecord(rawItem)) continue;
		const item = rawItem as PdfOutlineItem;
		const title = typeof item.title === "string" ? item.title.trim() : "";

		if (title) {
			const target = await resolvePdfOutlineTarget({
				blocks: input.blocks,
				dest: item.dest,
				pdfDocument: input.pdfDocument,
				viewportsByPhysicalPageNumber: input.viewportsByPhysicalPageNumber,
			});
			input.entries.push({
				order: input.entries.length,
				depth: input.depth,
				title,
				...(target !== undefined ? { target } : {}),
			});
		}

		if (Array.isArray(item.items)) {
			await appendPdfOutlineItems({
				...input,
				items: item.items,
				depth: input.depth + 1,
			});
		}
	}
}

async function resolvePdfOutlineTarget(input: {
	pdfDocument: PDFDocumentProxy;
	blocks: PdfMetadataBlockCandidate[];
	dest: unknown;
	viewportsByPhysicalPageNumber: Map<number, PageViewport>;
}) {
	const explicitDestination = await explicitPdfDestination(
		input.pdfDocument,
		input.dest,
	);
	if (!explicitDestination) return undefined;

	const physicalPageNumber = await physicalPageNumberFromPdfDestination(
		input.pdfDocument,
		explicitDestination,
	);
	if (
		physicalPageNumber === undefined ||
		physicalPageNumber < 1 ||
		physicalPageNumber > input.pdfDocument.numPages
	) {
		return undefined;
	}

	const viewport = await pageViewport(
		input.pdfDocument,
		input.viewportsByPhysicalPageNumber,
		physicalPageNumber,
	);
	const destinationPoint = destinationPointFromPdfDestination(
		explicitDestination,
		viewport,
	);
	const blockId = destinationPoint
		? blockIdForDestinationPoint({
				blocks: input.blocks,
				destinationPoint,
				physicalPageNumber,
				viewport,
			})
		: undefined;
	const sourcePoint =
		destinationPoint?.kind === "point"
			? destinationPoint.sourcePoint
			: undefined;

	return {
		physicalPageNumber,
		...(blockId !== undefined ? { blockId } : {}),
		...(sourcePoint !== undefined ? { sourcePoint } : {}),
	};
}

async function explicitPdfDestination(
	pdfDocument: PDFDocumentProxy,
	dest: unknown,
) {
	if (typeof dest === "string") {
		const namedDestination = await pdfDocument.getDestination(dest);
		return Array.isArray(namedDestination) ? namedDestination : undefined;
	}

	return Array.isArray(dest) ? dest : undefined;
}

async function physicalPageNumberFromPdfDestination(
	pdfDocument: PDFDocumentProxy,
	destination: unknown[],
) {
	const pageReference = destination[0];
	if (Number.isInteger(pageReference)) return Number(pageReference) + 1;
	if (!isPdfPageRef(pageReference)) return undefined;

	try {
		return (await pdfDocument.getPageIndex(pageReference)) + 1;
	} catch {
		return undefined;
	}
}

async function pageViewport(
	pdfDocument: PDFDocumentProxy,
	viewportsByPhysicalPageNumber: Map<number, PageViewport>,
	physicalPageNumber: number,
) {
	const cachedViewport = viewportsByPhysicalPageNumber.get(physicalPageNumber);
	if (cachedViewport) return cachedViewport;

	const page = await pdfDocument.getPage(physicalPageNumber);
	const viewport = page.getViewport({ scale: 1 });
	viewportsByPhysicalPageNumber.set(physicalPageNumber, viewport);
	return viewport;
}

function destinationPointFromPdfDestination(
	destination: unknown[],
	viewport: PageViewport,
): DestinationPoint | undefined {
	const kind = pdfDestinationKind(destination[1]);

	if (kind === "XYZ") {
		const x = destination[2];
		const y = destination[3];
		if (typeof x !== "number" || typeof y !== "number") return undefined;
		return normalizedPointFromPdfPoint(viewport, x, y);
	}

	if (kind === "FitR") {
		const left = destination[2];
		const bottom = destination[3];
		const right = destination[4];
		const top = destination[5];
		if (
			typeof left !== "number" ||
			typeof bottom !== "number" ||
			typeof right !== "number" ||
			typeof top !== "number"
		) {
			return undefined;
		}

		const [viewportLeft, viewportBottom] = viewport.convertToViewportPoint(
			left,
			bottom,
		);
		const [viewportRight, viewportTop] = viewport.convertToViewportPoint(
			right,
			top,
		);
		return {
			kind: "point",
			sourcePoint: {
				left:
					(Math.min(viewportLeft, viewportRight) +
						Math.max(viewportLeft, viewportRight)) /
					2 /
					viewport.width,
				top:
					(Math.min(viewportTop, viewportBottom) +
						Math.max(viewportTop, viewportBottom)) /
					2 /
					viewport.height,
			},
		};
	}

	if (kind === "FitH" || kind === "FitBH") {
		const y = destination[2];
		if (typeof y !== "number") return undefined;
		const [, viewportTop] = viewport.convertToViewportPoint(0, y);
		return { kind: "vertical", top: viewportTop / viewport.height };
	}

	return undefined;
}

function normalizedPointFromPdfPoint(
	viewport: PageViewport,
	x: number,
	y: number,
): DestinationPoint {
	const [left, top] = viewport.convertToViewportPoint(x, y);
	return {
		kind: "point",
		sourcePoint: {
			left: left / viewport.width,
			top: top / viewport.height,
		},
	};
}

function blockIdForDestinationPoint(input: {
	blocks: PdfMetadataBlockCandidate[];
	physicalPageNumber: number;
	destinationPoint: DestinationPoint;
	viewport: PageViewport;
}) {
	return input.destinationPoint.kind === "point"
		? nearestTopEdgeBlockId({
				blocks: input.blocks,
				physicalPageNumber: input.physicalPageNumber,
				sourcePoint: input.destinationPoint.sourcePoint,
				viewport: input.viewport,
			})
		: verticalDestinationBlockId({
				blocks: input.blocks,
				physicalPageNumber: input.physicalPageNumber,
				top: input.destinationPoint.top,
			});
}

function nearestTopEdgeBlockId(input: {
	blocks: PdfMetadataBlockCandidate[];
	physicalPageNumber: number;
	sourcePoint: NormalizedSourcePoint;
	viewport: PageViewport;
}) {
	const candidates = input.blocks
		.flatMap((block) => {
			if (block.pageNumber !== input.physicalPageNumber) return [];
			const box = block.normalizedBoundingBox;
			if (!box) return [];

			return [
				{
					blockId: block.blockId,
					distancePoints: topEdgeDistancePoints({
						box,
						sourcePoint: input.sourcePoint,
						viewport: input.viewport,
					}),
				},
			];
		})
		.sort((a, b) => a.distancePoints - b.distancePoints);
	const [best, secondBest] = candidates;
	if (!best || best.distancePoints > maxTopEdgeDistancePoints) return undefined;
	if (
		secondBest &&
		secondBest.distancePoints - best.distancePoints < topEdgeTieDistancePoints
	) {
		return undefined;
	}
	return best.blockId;
}

function topEdgeDistancePoints(input: {
	box: NonNullable<PdfMetadataBlockCandidate["normalizedBoundingBox"]>;
	sourcePoint: NormalizedSourcePoint;
	viewport: PageViewport;
}) {
	const dx =
		horizontalDistanceToBox(input.box, input.sourcePoint.left) *
		input.viewport.width;
	const dy =
		Math.abs(input.sourcePoint.top - input.box.top) * input.viewport.height;
	return Math.hypot(dx, dy);
}

function horizontalDistanceToBox(
	box: NonNullable<PdfMetadataBlockCandidate["normalizedBoundingBox"]>,
	left: number,
) {
	if (left < box.left) return box.left - left;
	if (left > box.left + box.width) return left - (box.left + box.width);
	return 0;
}

function verticalDestinationBlockId(input: {
	blocks: PdfMetadataBlockCandidate[];
	physicalPageNumber: number;
	top: number;
}) {
	const matchingBlocks = input.blocks.filter((block) => {
		if (block.pageNumber !== input.physicalPageNumber) return false;
		const box = block.normalizedBoundingBox;
		return box ? containsNormalizedY(box, input.top) : false;
	});

	return matchingBlocks.length === 1 ? matchingBlocks[0]?.blockId : undefined;
}

function containsNormalizedY(
	box: NonNullable<PdfMetadataBlockCandidate["normalizedBoundingBox"]>,
	top: number,
) {
	return (
		top >= box.top - pointMatchEpsilon &&
		top <= box.top + box.height + pointMatchEpsilon
	);
}

function pdfDestinationKind(value: unknown) {
	if (!isRecord(value) || typeof value.name !== "string") return undefined;
	return value.name;
}

function isPdfPageRef(value: unknown): value is PdfPageRef {
	return (
		isRecord(value) &&
		Number.isInteger(value.num) &&
		Number.isInteger(value.gen)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
