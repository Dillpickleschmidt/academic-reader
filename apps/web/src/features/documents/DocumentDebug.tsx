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
import type { NarrationAudioMetadata } from "./document-narration-audio";

interface ReaderOverlayRect {
	block: Doc<"blocks">;
	left: number;
	top: number;
	width: number;
	height: number;
}

interface TableOfContentsSourcePoint {
	left: number;
	top: number;
	pageNumber: number;
	blockId?: string;
	title: string;
}

export function SourceDebugOverlayLayer(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	pageNumber: number;
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	const sourceBlocks = createMemo(() =>
		props.debugEnabled
			? blocksWithSourceGeometryForPage(props.blocks, props.pageNumber)
			: [],
	);
	const tableOfContentsSourcePoints = createMemo(() =>
		props.debugEnabled
			? tableOfContentsSourcePointsForPage(
					props.tableOfContentsEntries,
					props.pageNumber,
				)
			: [],
	);
	const narrationAudioByBlockId = createMemo(() =>
		narrationAudioByBlockIdMap(props.narrationAudio),
	);

	return (
		<div
			class="pointer-events-none absolute inset-0 overflow-visible"
			data-page-number={props.pageNumber}
			data-source-overlay-layer=""
		>
			<For each={tableOfContentsSourcePoints()}>
				{(sourcePoint) => <SourceDebugCrosshair sourcePoint={sourcePoint} />}
			</For>
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
							narrationAudio={narrationAudioByBlockId().get(block.blockId)}
							narrationAudioLoaded={props.narrationAudio !== undefined}
							forceVisible={props.activeDebugBlockId === block.blockId}
							maxHeight="max(6rem, 100%)"
						/>
					</button>
				)}
			</For>
		</div>
	);
}

function SourceDebugCrosshair(props: {
	sourcePoint: TableOfContentsSourcePoint;
}) {
	return (
		<div
			aria-label={`Table of Contents jump target: ${props.sourcePoint.title}`}
			class="group pointer-events-auto absolute z-40 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-red-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
			role="img"
			style={sourcePointStyle(props.sourcePoint)}
		>
			<svg aria-hidden="true" class="h-full w-full" viewBox="0 0 20 20">
				<line
					x1="10"
					y1="0"
					x2="10"
					y2="20"
					stroke="currentColor"
					stroke-width="1.5"
					vector-effect="non-scaling-stroke"
				/>
				<line
					x1="0"
					y1="10"
					x2="20"
					y2="10"
					stroke="currentColor"
					stroke-width="1.5"
					vector-effect="non-scaling-stroke"
				/>
				<circle cx="10" cy="10" r="3" fill="currentColor" />
			</svg>
			<TocSourcePointCard sourcePoint={props.sourcePoint} />
		</div>
	);
}

function TocSourcePointCard(props: {
	sourcePoint: TableOfContentsSourcePoint;
}) {
	return (
		<span
			class={debugMetadataCardClass(false)}
			style={{ "max-height": "10rem" }}
		>
			<span class="block">
				<span class="block font-semibold">TOC target</span>
				<span class="mt-1 block text-stone-100">{props.sourcePoint.title}</span>
				<span class="block text-stone-100">
					page {props.sourcePoint.pageNumber}
				</span>
				<span class="block text-stone-100">
					point x{debugPercent(props.sourcePoint.left)} y
					{debugPercent(props.sourcePoint.top)}
				</span>
				<span class="block text-stone-100">
					Block {props.sourcePoint.blockId ?? "page-only"}
				</span>
			</span>
		</span>
	);
}

export function ReaderDebugOverlayLayer(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[];
	contentContainer: HTMLDivElement | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowSource: (block: Doc<"blocks">) => void;
}) {
	const [rects, setRects] = createSignal<ReaderOverlayRect[]>([]);
	const narrationAudioByBlockId = createMemo(() =>
		narrationAudioByBlockIdMap(props.narrationAudio),
	);

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
						narrationAudio={narrationAudioByBlockId().get(rect.block.blockId)}
						narrationAudioLoaded={props.narrationAudio !== undefined}
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
	narrationAudio: NarrationAudioMetadata | undefined;
	narrationAudioLoaded: boolean;
	rect: ReaderOverlayRect;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowSource: (block: Doc<"blocks">) => void;
}) {
	const isNavigable = () =>
		props.rect.block.normalizedBoundingBox !== undefined;
	const style = () => readerBoxStyle(props.rect);
	const maxHeight = () => `${Math.max(props.rect.height, 96)}px`;
	const card = () => (
		<DebugMetadataCard
			block={props.rect.block}
			debugEvents={props.debugEvents}
			document={props.document}
			narrationAudio={props.narrationAudio}
			narrationAudioLoaded={props.narrationAudioLoaded}
			forceVisible={props.active}
			maxHeight={maxHeight()}
		/>
	);

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
			{card()}
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
			{card()}
		</div>
	);
}

function DebugMetadataCard(props: {
	block: Doc<"blocks">;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata | undefined;
	narrationAudioLoaded: boolean;
	forceVisible: boolean;
	maxHeight: string;
}) {
	const evidence = createMemo(() => blockContentEvidence(props.block));
	const narration = createMemo(() =>
		blockNarrationEvidence(
			props.document,
			props.block,
			props.debugEvents,
			props.narrationAudio,
			props.narrationAudioLoaded,
		),
	);

	return (
		<span
			class={debugMetadataCardClass(props.forceVisible)}
			style={{ "max-height": props.maxHeight }}
		>
			<span class="block">
				<span class="block font-semibold">
					#{props.block.order + 1} {props.block.blockType}
				</span>
				<span class="mt-1 block text-stone-100">
					Block {props.block.blockId}
				</span>
				<span class="block text-stone-100">raw {props.block.rawBlockType}</span>
				<span class="block text-stone-100">
					page {props.block.pageNumber ?? "—"}
				</span>
				<span class="block text-stone-100">
					{bboxText(props.block.normalizedBoundingBox)}
				</span>
				<span class="mt-1 block text-stone-100">
					HTML {evidence().htmlLength} · text {evidence().textLength} · images{" "}
					{evidence().imageCount} · citations {evidence().inlineCitationCount} ·
					markdown {evidence().hasMarkdown ? "yes" : "no"}
				</span>
				<span class="mt-1 block text-stone-100">
					Narration State: {narration().narration}
				</span>
				<span class="block text-stone-100">Text: {narration().text}</span>
				<span class="block text-stone-100">Audio: {narration().audio}</span>
				<span class="block text-stone-100">
					Alignment: {narration().alignment}
				</span>
			</span>
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

function tableOfContentsSourcePointsForPage(
	entries: Doc<"tableOfContentsEntries">[] | undefined,
	pageNumber: number,
): TableOfContentsSourcePoint[] {
	return (entries ?? []).flatMap((entry) => {
		const target = entry.target;
		if (target?.physicalPageNumber !== pageNumber || !target.sourcePoint) {
			return [];
		}

		return [
			{
				...target.sourcePoint,
				blockId: target.blockId,
				pageNumber,
				title: entry.title,
			},
		];
	});
}

function sourcePointStyle(sourcePoint: TableOfContentsSourcePoint) {
	return {
		left: `${sourcePoint.left * 100}%`,
		top: `${sourcePoint.top * 100}%`,
	};
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
		inlineCitationCount: inlineCitationCount(block.contentHtml),
		textLength: text.length,
	};
}

function inlineCitationCount(html: string) {
	const spanPattern = /<span\b[^>]*>/gi;
	let count = 0;
	let match = spanPattern.exec(html);

	while (match) {
		if (elementHasClass(match[0], "inline-citation")) count += 1;
		match = spanPattern.exec(html);
	}

	return count;
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

function blockNarrationEvidence(
	document: Doc<"documents"> | undefined,
	block: Doc<"blocks">,
	events: Doc<"processingEvents">[] | undefined,
	audio: NarrationAudioMetadata | undefined,
	audioLoaded: boolean,
) {
	const narration = document?.processingConfiguration.narration;
	if (!narration?.enabled) {
		return {
			narration: "off",
			text: "not generated",
			audio: "not recorded",
			alignment: "not recorded",
		};
	}

	if (events === undefined) {
		return {
			narration: `${narration.voice} · events loading`,
			text: "events loading",
			audio: "events loading",
			alignment: "events loading",
		};
	}

	const blockEvents = events.filter(
		(event) =>
			event.blockId === block.blockId && event.type.startsWith("narration."),
	);
	const latestEvent = blockEvents.at(-1);

	return {
		narration: blockNarrationText(block, narration.voice, latestEvent),
		text: blockNarrationGeneratedText(block),
		audio: blockNarrationAudioText(audio, audioLoaded),
		alignment: blockNarrationAlignmentText(audio, audioLoaded),
	};
}

function blockNarrationText(
	block: Doc<"blocks">,
	voice: string,
	latestEvent: Doc<"processingEvents"> | undefined,
) {
	const persisted = block.narration;
	if (!persisted) {
		return latestEvent
			? `${voice} · pending eligibility · ${latestEvent.type}`
			: `${voice} · pending eligibility`;
	}
	if (persisted.decision === "eligible") {
		return `${voice} · eligible · ${persisted.preparation.join(", ")}`;
	}
	return `${voice} · ineligible · ${persisted.reason}`;
}

function blockNarrationGeneratedText(block: Doc<"blocks">) {
	const persisted = block.narration;
	if (persisted?.decision !== "eligible" || !persisted.text) {
		return "not generated";
	}
	return persisted.text.length > 160
		? `${persisted.text.slice(0, 157)}…`
		: persisted.text;
}

function blockNarrationAudioText(
	audio: NarrationAudioMetadata | undefined,
	loaded: boolean,
) {
	if (!loaded) return "loading";
	if (!audio) return "missing";
	return `present · ${formatDuration(audio.durationMs)} · timestamps ${audio.wordTimestampCount}`;
}

function blockNarrationAlignmentText(
	audio: NarrationAudioMetadata | undefined,
	loaded: boolean,
) {
	if (!loaded) return "loading";
	if (!audio) return "missing";
	return [audio.alignment.status, audio.alignment.source, audio.alignment.error]
		.filter(Boolean)
		.join(" · ");
}

function narrationAudioByBlockIdMap(
	audio: NarrationAudioMetadata[] | undefined,
) {
	return new Map((audio ?? []).map((item) => [item.blockId, item]));
}

function formatDuration(durationMs: number) {
	return `${Math.round(durationMs / 100) / 10}s`;
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
