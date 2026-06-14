import type { Doc } from "@academic-reader/convex/data-model";
import { blockTypes } from "@academic-reader/shared/blocks";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
} from "solid-js";
import { imageSources } from "./document-html";

interface ReaderOverlayRect {
	block: Doc<"blocks">;
	left: number;
	top: number;
	width: number;
	height: number;
}

export function SourceDebugOverlayLayer(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	pageNumber: number;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	const sourceBlocks = createMemo(() =>
		props.debugEnabled
			? blocksWithSourceGeometryForPage(props.blocks, props.pageNumber)
			: [],
	);

	return (
		<div
			class="pointer-events-none absolute inset-0 overflow-visible"
			data-page-number={props.pageNumber}
			data-source-overlay-layer=""
		>
			<For each={sourceBlocks()}>
				{(block) => (
					<button
						id={sourceBlockElementId(block._id)}
						class={debugOverlayBoxClass(
							block.blockType,
							props.activeDebugBlockId === block.blockId,
							true,
						)}
						style={sourceBoxStyle(block.normalizedBoundingBox)}
						type="button"
						onBlur={() => props.onHoverDebugBlock(undefined)}
						onClick={() => props.onShowReader(block)}
						onFocus={() => props.onHoverDebugBlock(block.blockId)}
						onMouseEnter={() => props.onHoverDebugBlock(block.blockId)}
						onMouseLeave={() => props.onHoverDebugBlock(undefined)}
					>
						<DebugMetadataCard
							block={block}
							debugEvents={props.debugEvents}
							document={props.document}
							forceVisible={props.activeDebugBlockId === block.blockId}
							maxHeight="max(6rem, 100%)"
						/>
					</button>
				)}
			</For>
		</div>
	);
}

export function ReaderDebugOverlayLayer(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[];
	contentContainer: HTMLDivElement | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowSource: (block: Doc<"blocks">) => void;
}) {
	const [rects, setRects] = createSignal<ReaderOverlayRect[]>([]);

	createEffect(() => {
		const container = props.contentContainer;
		const blocks = props.blocks;
		if (!props.debugEnabled || !container || blocks.length === 0) {
			setRects([]);
			return;
		}

		let frame: number | undefined;
		const measure = () => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = undefined;
				setRects(measureReaderOverlayRects(container, blocks));
			});
		};
		const resizeObserver = new ResizeObserver(measure);

		resizeObserver.observe(container);
		for (const block of blocks) {
			const element = document.getElementById(readerBlockElementId(block._id));
			if (element) resizeObserver.observe(element);
		}
		window.addEventListener("resize", measure);
		measure();

		onCleanup(() => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			window.removeEventListener("resize", measure);
		});
	});

	return (
		<div class="pointer-events-none absolute inset-0 z-10 overflow-visible">
			<For each={rects()}>
				{(rect) => (
					<ReaderDebugOverlayBox
						active={props.activeDebugBlockId === rect.block.blockId}
						debugEvents={props.debugEvents}
						document={props.document}
						rect={rect}
						onHoverDebugBlock={props.onHoverDebugBlock}
						onShowSource={props.onShowSource}
					/>
				)}
			</For>
		</div>
	);
}

function ReaderDebugOverlayBox(props: {
	active: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	rect: ReaderOverlayRect;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowSource: (block: Doc<"blocks">) => void;
}) {
	const isNavigable = () =>
		props.rect.block.normalizedBoundingBox !== undefined;
	const style = () => readerBoxStyle(props.rect);
	const maxHeight = () => `${Math.max(props.rect.height, 96)}px`;

	return isNavigable() ? (
		<button
			id={readerOverlayElementId(props.rect.block._id)}
			class={debugOverlayBoxClass(
				props.rect.block.blockType,
				props.active,
				true,
			)}
			style={style()}
			type="button"
			onBlur={() => props.onHoverDebugBlock(undefined)}
			onClick={() => props.onShowSource(props.rect.block)}
			onFocus={() => props.onHoverDebugBlock(props.rect.block.blockId)}
			onMouseEnter={() => props.onHoverDebugBlock(props.rect.block.blockId)}
			onMouseLeave={() => props.onHoverDebugBlock(undefined)}
		>
			<DebugMetadataCard
				block={props.rect.block}
				debugEvents={props.debugEvents}
				document={props.document}
				forceVisible={props.active}
				maxHeight={maxHeight()}
			/>
		</button>
	) : (
		<div
			id={readerOverlayElementId(props.rect.block._id)}
			class={debugOverlayBoxClass(
				props.rect.block.blockType,
				props.active,
				false,
			)}
			style={style()}
		>
			<DebugMetadataCard
				block={props.rect.block}
				debugEvents={props.debugEvents}
				document={props.document}
				forceVisible={props.active}
				maxHeight={maxHeight()}
			/>
		</div>
	);
}

function DebugMetadataCard(props: {
	block: Doc<"blocks">;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	forceVisible: boolean;
	maxHeight: string;
}) {
	const evidence = createMemo(() => blockContentEvidence(props.block));
	const narration = createMemo(() =>
		blockNarrationEvidence(props.document, props.block, props.debugEvents),
	);

	return (
		<span
			class={debugMetadataCardClass(props.forceVisible)}
			style={{ "max-height": props.maxHeight }}
		>
			<span class="block font-semibold">
				#{props.block.order + 1} {props.block.blockType}
			</span>
			<span class="mt-1 block">Block {props.block.blockId}</span>
			<span class="block">raw {props.block.rawBlockType}</span>
			<span class="block">page {props.block.pageNumber ?? "—"}</span>
			<span class="block">{bboxText(props.block.normalizedBoundingBox)}</span>
			<span class="mt-1 block">
				HTML {evidence().htmlLength} · text {evidence().textLength} · images{" "}
				{evidence().imageCount} · markdown{" "}
				{evidence().hasMarkdown ? "yes" : "no"}
			</span>
			<span class="mt-1 block">Narration: {narration().narration}</span>
			<span class="block">Audio: {narration().audio}</span>
			<span class="block">Alignment: {narration().alignment}</span>
		</span>
	);
}

export function DebugStatsPanel(props: { blocks: Doc<"blocks">[] }) {
	const stats = createMemo(() => blockDebugStats(props.blocks));

	return (
		<aside class="fixed bottom-4 left-4 z-30 max-w-sm rounded-2xl border border-amber-300/30 bg-stone-950/90 p-3 text-xs text-stone-200 shadow-xl backdrop-blur">
			<div class="font-semibold text-amber-200">Debug Overlay</div>
			<div class="mt-2 grid grid-cols-2 gap-2">
				<div>Blocks: {stats().total}</div>
				<div>Geometry: {stats().withGeometry}</div>
				<div>Missing geometry: {stats().withoutGeometry}</div>
				<div>Unknown: {stats().unknown}</div>
			</div>
			<div class="mt-2 flex flex-wrap gap-1.5">
				<For each={stats().byType}>
					{([blockType, count]) => (
						<span class={debugStatsTypeClass(blockType)}>
							{blockType} {count}
						</span>
					)}
				</For>
			</div>
		</aside>
	);
}

export function scrollElementTopIntoNearestScroller(elementId: string) {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			const element = document.getElementById(elementId);
			if (!element) return;

			const scroller = nearestScrollContainer(element);
			if (!scroller) {
				element.scrollIntoView({ block: "start", behavior: "smooth" });
				return;
			}

			const elementRect = element.getBoundingClientRect();
			const scrollerRect = scroller.getBoundingClientRect();
			scroller.scrollTo({
				behavior: "smooth",
				top: scroller.scrollTop + elementRect.top - scrollerRect.top - 56,
			});
		});
	});
}

export function sourceBlockElementId(blockId: string) {
	return `source-block-${blockId}`;
}

export function readerBlockElementId(blockId: string) {
	return `reader-block-${blockId}`;
}

function readerOverlayElementId(blockId: string) {
	return `reader-overlay-${blockId}`;
}

function measureReaderOverlayRects(
	container: HTMLDivElement,
	blocks: Doc<"blocks">[],
) {
	const containerRect = container.getBoundingClientRect();
	const rects: ReaderOverlayRect[] = [];

	for (const block of blocks) {
		const element = document.getElementById(readerBlockElementId(block._id));
		if (!element) continue;

		const blockRect = element.getBoundingClientRect();
		if (blockRect.width <= 0 || blockRect.height <= 0) continue;

		rects.push({
			block,
			left: blockRect.left - containerRect.left,
			top: blockRect.top - containerRect.top,
			width: blockRect.width,
			height: blockRect.height,
		});
	}

	return rects;
}

function nearestScrollContainer(element: HTMLElement) {
	let current = element.parentElement;
	while (current) {
		const style = getComputedStyle(current);
		const overflow = `${style.overflow} ${style.overflowY} ${style.overflowX}`;
		if (
			/(auto|scroll)/.test(overflow) &&
			current.scrollHeight > current.clientHeight
		) {
			return current;
		}
		current = current.parentElement;
	}
	return undefined;
}

function blocksWithSourceGeometryForPage(
	blocks: Doc<"blocks">[] | undefined,
	pageNumber: number,
) {
	return (blocks ?? []).filter(
		(block) =>
			block.pageNumber === pageNumber &&
			block.normalizedBoundingBox !== undefined,
	);
}

function sourceBoxStyle(
	bbox: NonNullable<Doc<"blocks">["normalizedBoundingBox"]> | undefined,
) {
	if (!bbox) return {};
	return {
		left: `${bbox.left * 100}%`,
		top: `${bbox.top * 100}%`,
		width: `${bbox.width * 100}%`,
		height: `${bbox.height * 100}%`,
	};
}

function readerBoxStyle(rect: ReaderOverlayRect) {
	return {
		left: `${rect.left}px`,
		top: `${rect.top}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
	};
}

function bboxText(
	bbox: NonNullable<Doc<"blocks">["normalizedBoundingBox"]> | undefined,
) {
	if (!bbox) return "Source Geometry missing";
	return `bbox x${debugPercent(bbox.left)} y${debugPercent(bbox.top)} w${debugPercent(bbox.width)} h${debugPercent(bbox.height)}`;
}

function debugPercent(value: number) {
	return `${Math.round(value * 1000) / 10}%`;
}

function blockDebugStats(blocks: Doc<"blocks">[]) {
	const counts = new Map<string, number>();
	let withGeometry = 0;

	for (const block of blocks) {
		counts.set(block.blockType, (counts.get(block.blockType) ?? 0) + 1);
		if (block.normalizedBoundingBox) withGeometry += 1;
	}

	return {
		total: blocks.length,
		withGeometry,
		withoutGeometry: blocks.length - withGeometry,
		unknown: counts.get("unknown") ?? 0,
		byType: blockTypes
			.map((blockType) => [blockType, counts.get(blockType) ?? 0] as const)
			.filter(([, count]) => count > 0),
	};
}

function blockContentEvidence(block: Doc<"blocks">) {
	const text = block.contentHtml
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return {
		hasMarkdown: !!block.contentMarkdown,
		htmlLength: block.contentHtml.length,
		imageCount: imageSources(block.contentHtml).length,
		textLength: text.length,
	};
}

function blockNarrationEvidence(
	document: Doc<"documents"> | undefined,
	block: Doc<"blocks">,
	events: Doc<"processingEvents">[] | undefined,
) {
	const narration = document?.processingConfiguration.narration;
	if (!narration?.enabled) {
		return {
			narration: "off",
			audio: "not recorded",
			alignment: "not recorded",
		};
	}

	if (events === undefined) {
		return {
			narration: `${narration.voice} · events loading`,
			audio: "events loading",
			alignment: "events loading",
		};
	}

	const blockEvents = events.filter(
		(event) =>
			event.blockId === block.blockId && event.type.startsWith("narration."),
	);
	const latestEvent = blockEvents.at(-1);
	const audio = latestBlockDataValue(blockEvents, [
		"audioStatus",
		"audio",
		"durationMs",
		"durationSeconds",
	]);
	const alignment = latestBlockDataValue(blockEvents, [
		"alignmentStatus",
		"alignment",
		"wordTimings",
	]);

	return {
		narration: latestEvent
			? `${narration.voice} · ${latestEvent.type} · ${latestEvent.severity}`
			: `${narration.voice} · no block event`,
		audio: audio ?? "not recorded",
		alignment: alignment ?? "not recorded",
	};
}

function latestBlockDataValue(
	events: Doc<"processingEvents">[] | undefined,
	keys: string[],
) {
	for (const event of [...(events ?? [])].reverse()) {
		if (!event.data) continue;
		for (const key of keys) {
			const value = event.data[key];
			if (value !== undefined) return String(value);
		}
	}
	return undefined;
}

export function debugToggleButtonClass(isActive: boolean) {
	return isActive
		? "rounded-full border border-amber-300 bg-amber-300 px-4 py-2 font-medium text-sm text-stone-950 shadow-lg"
		: "rounded-full border border-stone-700 bg-stone-950/85 px-4 py-2 text-sm text-stone-100 shadow-lg backdrop-blur hover:bg-stone-900";
}

function debugOverlayBoxClass(
	blockType: string,
	isActive: boolean,
	isNavigable: boolean,
) {
	return `${debugToneClass(blockType)} ${isActive ? "z-30 ring-4 ring-white/80" : "z-10"} group pointer-events-auto absolute appearance-none overflow-visible border-2 p-0 text-left text-[10px] ${isNavigable ? "cursor-pointer" : "cursor-default"}`;
}

function debugMetadataCardClass(forceVisible: boolean) {
	return `${forceVisible ? "block" : "hidden group-focus:block group-focus-within:block group-hover:block"} absolute top-0 right-0 z-50 w-64 overflow-y-auto rounded-bl-md border border-current bg-stone-950/95 p-2 text-left text-[10px] leading-tight shadow-lg backdrop-blur`;
}

function debugStatsTypeClass(blockType: string) {
	return `${debugToneClass(blockType)} rounded-full border px-2 py-0.5`;
}

function debugToneClass(blockType: string) {
	switch (blockType) {
		case "heading":
			return "border-amber-300 bg-amber-300/20 text-amber-100";
		case "table":
			return "border-emerald-300 bg-emerald-300/20 text-emerald-100";
		case "figure":
			return "border-violet-300 bg-violet-300/20 text-violet-100";
		case "equation":
			return "border-fuchsia-300 bg-fuchsia-300/20 text-fuchsia-100";
		case "caption":
			return "border-cyan-300 bg-cyan-300/20 text-cyan-100";
		case "listItem":
			return "border-lime-300 bg-lime-300/20 text-lime-100";
		case "pageHeader":
		case "pageFooter":
			return "border-slate-300 bg-slate-300/20 text-slate-100";
		case "footnote":
			return "border-indigo-300 bg-indigo-300/20 text-indigo-100";
		case "code":
			return "border-orange-300 bg-orange-300/20 text-orange-100";
		case "form":
			return "border-rose-300 bg-rose-300/20 text-rose-100";
		case "paragraph":
			return "border-sky-300 bg-sky-300/20 text-sky-100";
		default:
			return "border-stone-300 bg-stone-300/20 text-stone-100";
	}
}
