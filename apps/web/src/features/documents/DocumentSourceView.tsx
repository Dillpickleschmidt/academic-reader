import type { Doc } from "@academic-reader/convex/data-model";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import * as UTIF from "utif";
import { buttonVariants } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Slider } from "~/components/ui/slider";
import { SourceDebugOverlayLayer } from "./DocumentDebug";
import type { NarrationAudioMetadata } from "./document-narration-audio";
import { EmptyPane, errorMessage, RetryMessage } from "./document-page-ui";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface SourceAccess {
	url: string;
	expiresAt: string;
	filename: string;
	mimeType: string;
}

export function SourceView(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	pages: Doc<"pages">[] | undefined;
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	sourceAccess: SourceAccess | undefined;
	sourceAccessLoading: boolean;
	sourceAccessError: unknown;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onRetrySourceAccess: () => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	const loadedSource = createMemo(() => {
		if (!props.document || props.pages === undefined) return undefined;
		return { document: props.document, pages: props.pages };
	});
	const isPdf = () => props.document?.mimeType === "application/pdf";
	const [zoom, setZoom] = createSignal(defaultPdfZoom);

	function zoomTo(value: number) {
		setZoom(Math.min(Math.max(value, minPdfZoom), maxPdfZoom));
	}

	function handleWheel(event: WheelEvent) {
		if (!event.ctrlKey || !isPdf()) return;
		event.preventDefault();
		zoomTo(zoom() * (1 - event.deltaY * 0.002));
	}

	let pan:
		| {
				pointerId: number;
				originX: number;
				originY: number;
				scrollLeft: number;
				scrollTop: number;
				moved: boolean;
		  }
		| undefined;

	function handlePanPointerDown(
		event: PointerEvent & { currentTarget: HTMLDivElement },
	) {
		if (event.pointerType !== "mouse" || event.button !== 0) return;
		if (
			event.target instanceof Element &&
			event.target.closest("a, button, input, select, textarea")
		) {
			return;
		}
		pan = {
			pointerId: event.pointerId,
			originX: event.clientX,
			originY: event.clientY,
			scrollLeft: event.currentTarget.scrollLeft,
			scrollTop: event.currentTarget.scrollTop,
			moved: false,
		};
		document.documentElement.dataset.sourceViewPanning = "true";
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handlePanPointerMove(
		event: PointerEvent & { currentTarget: HTMLDivElement },
	) {
		if (pan?.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - pan.originX;
		const deltaY = event.clientY - pan.originY;
		if (!pan.moved) {
			if (Math.hypot(deltaX, deltaY) < 4) return;
			pan.moved = true;
			event.currentTarget.style.userSelect = "none";
		}
		event.currentTarget.scrollTo({
			left: pan.scrollLeft - deltaX,
			top: pan.scrollTop - deltaY,
		});
	}

	function handlePanPointerEnd(
		event: PointerEvent & { currentTarget: HTMLDivElement },
	) {
		if (pan?.pointerId !== event.pointerId) return;
		if (pan.moved) {
			suppressNextClick();
			event.currentTarget.style.userSelect = "";
		}
		delete document.documentElement.dataset.sourceViewPanning;
		pan = undefined;
	}

	onCleanup(() => {
		delete document.documentElement.dataset.sourceViewPanning;
	});

	return (
		<div class="flex h-full min-h-0 flex-col bg-background">
			<div class="flex h-10 shrink-0 items-center justify-between border-border border-b px-3">
				<span class="font-medium text-muted-foreground text-xs">Source</span>
				<Show when={isPdf()}>
					<div class="flex items-center gap-1">
						<button
							class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
							disabled={zoom() <= minPdfZoom}
							type="button"
							onClick={() => zoomTo(zoom() - pdfZoomStep)}
						>
							<ZoomOut />
							<span class="sr-only">Zoom out</span>
						</button>
						<Slider
							aria-label="Zoom"
							class="w-24"
							maxValue={maxPdfZoom}
							minValue={minPdfZoom}
							step={0.05}
							value={[zoom()]}
							onChange={(values) => setZoom(values[0] ?? defaultPdfZoom)}
						/>
						<button
							class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
							disabled={zoom() >= maxPdfZoom}
							type="button"
							onClick={() => zoomTo(zoom() + pdfZoomStep)}
						>
							<ZoomIn />
							<span class="sr-only">Zoom in</span>
						</button>
						<button
							class="w-11 text-center text-muted-foreground text-xs tabular-nums transition-colors hover:text-foreground"
							title="Reset to fit width"
							type="button"
							onClick={() => setZoom(defaultPdfZoom)}
						>
							{Math.round(zoom() * 100)}%
						</button>
					</div>
				</Show>
			</div>
			<div
				class="min-h-0 flex-1 cursor-grab overflow-auto pr-2.5 [scrollbar-gutter:stable]"
				on:pointercancel={handlePanPointerEnd}
				on:pointerdown={handlePanPointerDown}
				on:pointermove={handlePanPointerMove}
				on:pointerup={handlePanPointerEnd}
				on:wheel={handleWheel}
			>
				<Show when={loadedSource()} fallback={<SourceSkeleton />}>
					{(source) => (
						<Show
							when={props.sourceAccess}
							fallback={
								<Show
									when={!props.sourceAccessLoading}
									fallback={<SourceSkeleton />}
								>
									<RetryMessage
										body={errorMessage(props.sourceAccessError)}
										onRetry={props.onRetrySourceAccess}
										title="Could not create Source View URL"
									/>
								</Show>
							}
						>
							{(sourceAccess) => (
								<Show
									when={source().document.mimeType === "application/pdf"}
									fallback={
										<ImageSourceView
											activeDebugBlockId={props.activeDebugBlockId}
											blocks={props.blocks}
											debugEnabled={props.debugEnabled}
											debugEvents={props.debugEvents}
											document={source().document}
											narrationAudio={props.narrationAudio}
											mimeType={source().document.mimeType}
											pages={source().pages}
											tableOfContentsEntries={props.tableOfContentsEntries}
											url={sourceAccess().url}
											onHoverDebugBlock={props.onHoverDebugBlock}
											onShowReader={props.onShowReader}
										/>
									}
								>
									<PdfSourceView
										activeDebugBlockId={props.activeDebugBlockId}
										blocks={props.blocks}
										debugEnabled={props.debugEnabled}
										debugEvents={props.debugEvents}
										document={source().document}
										narrationAudio={props.narrationAudio}
										pages={source().pages}
										tableOfContentsEntries={props.tableOfContentsEntries}
										url={sourceAccess().url}
										zoom={zoom()}
										onHoverDebugBlock={props.onHoverDebugBlock}
										onShowReader={props.onShowReader}
									/>
								</Show>
							)}
						</Show>
					)}
				</Show>
			</div>
		</div>
	);
}

function SourceSkeleton() {
	return (
		<div class="flex min-w-full flex-col items-center gap-1">
			{[1, 2].map(() => (
				<div class="w-full">
					<div class="my-1 flex h-4 items-center justify-center">
						<Skeleton class="h-2.5 w-14" />
					</div>
					<Skeleton
						class="w-full rounded-none border border-border"
						style={{
							"aspect-ratio": `${defaultPdfPageWidth} / ${defaultPdfPageHeight}`,
						}}
					/>
				</div>
			))}
		</div>
	);
}

const defaultPdfPageWidth = 612;
const defaultPdfPageHeight = 792;
const defaultPdfZoom = 1;
const minPdfZoom = 0.75;
const maxPdfZoom = 2.5;
const pdfZoomStep = 0.25;

function PdfSourceView(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	pages: Doc<"pages">[];
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	url: string;
	zoom: number;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	const [pdfDocument, setPdfDocument] = createSignal<PDFDocumentProxy>();
	const [error, setError] = createSignal<string>();
	const [loading, setLoading] = createSignal(true);
	// Layout follows props.zoom immediately (the browser scales the existing
	// bitmap); the crisp re-render at device resolution runs once zoom settles.
	const [renderZoom, setRenderZoom] = createSignal(props.zoom);
	createEffect(() => {
		const target = props.zoom;
		const handle = setTimeout(() => setRenderZoom(target), 150);
		onCleanup(() => clearTimeout(handle));
	});
	const pageNumbers = createMemo(() => {
		if (props.pages.length) {
			return props.pages.map((page) => page.physicalPageNumber);
		}
		const pdf = pdfDocument();
		return pdf
			? Array.from({ length: pdf.numPages }, (_, index) => index + 1)
			: [];
	});
	const pageByPhysicalPageNumber = createMemo(
		() => new Map(props.pages.map((page) => [page.physicalPageNumber, page])),
	);

	createEffect(() => {
		const url = props.url;
		let cancelled = false;
		let loadedDocument: PDFDocumentProxy | undefined;

		setPdfDocument(undefined);
		setError(undefined);
		setLoading(true);

		void loadPdfDocument(url)
			.then((pdf) => {
				if (cancelled) {
					void pdf.cleanup();
					return;
				}
				loadedDocument = pdf;
				setPdfDocument(pdf);
			})
			.catch((loadError) => {
				if (!cancelled) setError(errorMessage(loadError));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		onCleanup(() => {
			cancelled = true;
			if (loadedDocument) void loadedDocument.cleanup();
		});
	});

	return (
		<Show
			when={!error()}
			fallback={<EmptyPane title="PDF render failed" body={error()} />}
		>
			<Show when={!loading()} fallback={<SourceSkeleton />}>
				<Show
					when={pdfDocument()}
					fallback={
						<EmptyPane
							title="No PDF loaded"
							body="The PDF could not be loaded."
						/>
					}
				>
					{(pdf) => (
						<div class="flex min-w-full flex-col items-center gap-1">
							<For each={pageNumbers()}>
								{(pageNumber) => {
									const page = () => pageByPhysicalPageNumber().get(pageNumber);

									return (
										<PdfPageCanvas
											activeDebugBlockId={props.activeDebugBlockId}
											blocks={props.blocks}
											debugEnabled={props.debugEnabled}
											debugEvents={props.debugEvents}
											document={props.document}
											narrationAudio={props.narrationAudio}
											pageHeight={page()?.height}
											pageLabel={page()?.pageLabel}
											pageNumber={pageNumber}
											pageWidth={page()?.width}
											tableOfContentsEntries={props.tableOfContentsEntries}
											pdfDocument={pdf()}
											renderZoom={renderZoom()}
											zoom={props.zoom}
											onHoverDebugBlock={props.onHoverDebugBlock}
											onShowReader={props.onShowReader}
										/>
									);
								}}
							</For>
						</div>
					)}
				</Show>
			</Show>
		</Show>
	);
}

function PdfPageCanvas(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	pageHeight: number | undefined;
	pageLabel: string | undefined;
	pdfDocument: PDFDocumentProxy;
	pageNumber: number;
	pageWidth: number | undefined;
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	renderZoom: number;
	zoom: number;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	let container: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let renderTask: RenderTask | undefined;
	const [page, setPage] = createSignal<PDFPageProxy>();
	const [width, setWidth] = createSignal(0);
	const [height, setHeight] = createSignal(
		props.pageHeight ?? defaultPdfPageHeight,
	);
	const [displayWidth, setDisplayWidth] = createSignal(
		props.pageWidth ?? defaultPdfPageWidth,
	);
	const [error, setError] = createSignal<string>();
	const [shouldRender, setShouldRender] = createSignal(false);

	onMount(() => {
		if (!container) return;

		const resizeObserver = new ResizeObserver(([entry]) => {
			setWidth(entry.contentRect.width);
		});
		const intersectionObserver = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) setShouldRender(true);
			},
			{ rootMargin: "1000px 0px" },
		);
		resizeObserver.observe(container);
		intersectionObserver.observe(container);
		onCleanup(() => {
			resizeObserver.disconnect();
			intersectionObserver.disconnect();
		});
	});

	createEffect(() => {
		const fitWidth = width();
		if (page() || fitWidth <= 0) return;

		const targetWidth = fitWidth * props.zoom;
		setDisplayWidth(targetWidth);
		setHeight(
			((props.pageHeight ?? defaultPdfPageHeight) /
				(props.pageWidth ?? defaultPdfPageWidth)) *
				targetWidth,
		);
	});

	createEffect(() => {
		if (!shouldRender()) return;

		let cancelled = false;
		setPage(undefined);
		setError(undefined);

		void props.pdfDocument
			.getPage(props.pageNumber)
			.then((loadedPage) => {
				if (!cancelled) setPage(loadedPage);
			})
			.catch((pageError) => {
				if (!cancelled) setError(errorMessage(pageError));
			});

		onCleanup(() => {
			cancelled = true;
		});
	});

	createEffect(() => {
		const loadedPage = page();
		const fitWidth = width();
		if (!loadedPage || !canvas || fitWidth <= 0) return;

		const baseViewport = loadedPage.getViewport({ scale: 1 });
		const targetWidth = fitWidth * props.zoom;
		const cssHeight = (baseViewport.height / baseViewport.width) * targetWidth;
		setDisplayWidth(targetWidth);
		setHeight(cssHeight);
		canvas.style.width = `${targetWidth}px`;
		canvas.style.height = `${cssHeight}px`;
	});

	createEffect(() => {
		const loadedPage = page();
		const fitWidth = width();
		if (!loadedPage || !canvas || fitWidth <= 0) return;

		if (renderTask) {
			renderTask.cancel();
			renderTask = undefined;
		}

		const baseViewport = loadedPage.getViewport({ scale: 1 });
		const targetWidth = fitWidth * props.renderZoom;
		const cssScale = targetWidth / baseViewport.width;
		const outputScale = cssScale * window.devicePixelRatio;
		const viewport = loadedPage.getViewport({ scale: outputScale });
		const cssHeight = baseViewport.height * cssScale;
		const context = canvas.getContext("2d");

		if (!context) {
			setError("Could not create PDF canvas context");
			return;
		}

		setDisplayWidth(targetWidth);
		setHeight(cssHeight);
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		canvas.style.width = `${targetWidth}px`;
		canvas.style.height = `${cssHeight}px`;

		const currentTask = loadedPage.render({
			canvas,
			canvasContext: context,
			viewport,
		});
		renderTask = currentTask;

		void currentTask.promise
			.catch((renderError) => {
				if (
					renderError instanceof Error &&
					renderError.name === "RenderingCancelledException"
				) {
					return;
				}
				setError(errorMessage(renderError));
			})
			.finally(() => {
				if (renderTask === currentTask) renderTask = undefined;
			});

		onCleanup(() => currentTask.cancel());
	});

	return (
		<div ref={container} class="w-full">
			<div class="my-1 text-center text-muted-foreground text-xs">
				{sourcePageTitle(props.pageNumber, props.pageLabel)}
			</div>
			<div
				class="relative mx-auto border border-border bg-white"
				style={{ width: `${displayWidth()}px` }}
			>
				<Show when={error()}>
					{(message) => (
						<p class="absolute inset-x-0 top-0 z-10 bg-destructive/25 p-2 text-destructive text-sm">
							{message()}
						</p>
					)}
				</Show>
				<div
					class="relative overflow-hidden"
					style={{ height: `${height()}px` }}
				>
					<canvas ref={canvas} class="block" />
					<Show when={props.debugEnabled}>
						<SourceDebugOverlayLayer
							activeDebugBlockId={props.activeDebugBlockId}
							blocks={props.blocks}
							debugEvents={props.debugEvents}
							document={props.document}
							narrationAudio={props.narrationAudio}
							pageNumber={props.pageNumber}
							tableOfContentsEntries={props.tableOfContentsEntries}
							onHoverDebugBlock={props.onHoverDebugBlock}
							onShowReader={props.onShowReader}
						/>
					</Show>
				</div>
			</div>
		</div>
	);
}

/* After a drag, the browser still dispatches a click at the pointer's final
   position; swallow that one so debug-overlay clicks don't fire. */
function suppressNextClick() {
	const suppress = (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		cleanup();
	};
	const cleanup = () => {
		document.removeEventListener("click", suppress, true);
		clearTimeout(handle);
	};
	document.addEventListener("click", suppress, { capture: true });
	const handle = setTimeout(cleanup, 0);
}

function sourcePageTitle(
	physicalPageNumber: number,
	pageLabel: string | undefined,
) {
	if (pageLabel && pageLabel !== String(physicalPageNumber)) {
		return `Page ${pageLabel} · physical ${physicalPageNumber}`;
	}
	return `Page ${physicalPageNumber}`;
}

function ImageSourceView(props: {
	activeDebugBlockId: string | undefined;
	blocks: Doc<"blocks">[] | undefined;
	debugEnabled: boolean;
	debugEvents: Doc<"processingEvents">[] | undefined;
	document: Doc<"documents"> | undefined;
	narrationAudio: NarrationAudioMetadata[] | undefined;
	mimeType: string;
	pages: Doc<"pages">[];
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	url: string;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	function pageNumber() {
		return props.pages[0]?.physicalPageNumber ?? 1;
	}

	return (
		<div class="relative mx-auto max-w-5xl overflow-hidden border border-border bg-white">
			<Show
				when={props.mimeType === "image/tiff"}
				fallback={
					<img alt="Source Document" class="block w-full" src={props.url} />
				}
			>
				<TiffCanvas url={props.url} />
			</Show>
			<Show when={props.debugEnabled}>
				<SourceDebugOverlayLayer
					activeDebugBlockId={props.activeDebugBlockId}
					blocks={props.blocks}
					debugEvents={props.debugEvents}
					document={props.document}
					narrationAudio={props.narrationAudio}
					pageNumber={pageNumber()}
					tableOfContentsEntries={props.tableOfContentsEntries}
					onHoverDebugBlock={props.onHoverDebugBlock}
					onShowReader={props.onShowReader}
				/>
			</Show>
		</div>
	);
}

function TiffCanvas(props: { url: string }) {
	let canvas: HTMLCanvasElement | undefined;
	const [error, setError] = createSignal<string>();

	createEffect(() => {
		const url = props.url;
		let cancelled = false;
		setError(undefined);

		void fetch(url)
			.then((response) => {
				if (!response.ok) throw new Error("Could not load Source Document");
				return response.arrayBuffer();
			})
			.then((buffer) => {
				if (cancelled || !canvas) return;
				const [image] = UTIF.decode(buffer);
				if (!image) throw new Error("TIFF Source Document has no image page");
				UTIF.decodeImage(buffer, image);
				const rgba = UTIF.toRGBA8(image);
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Could not create TIFF canvas context");

				canvas.width = image.width;
				canvas.height = image.height;
				context.putImageData(
					new ImageData(new Uint8ClampedArray(rgba), image.width, image.height),
					0,
					0,
				);
			})
			.catch((tiffError) => {
				if (!cancelled) setError(errorMessage(tiffError));
			});

		onCleanup(() => {
			cancelled = true;
		});
	});

	return (
		<Show
			when={!error()}
			fallback={<EmptyPane title="TIFF render failed" body={error()} />}
		>
			<canvas ref={canvas} class="block w-full" />
		</Show>
	);
}

function loadPdfDocument(url: string) {
	return pdfjs.getDocument({ url }).promise;
}
