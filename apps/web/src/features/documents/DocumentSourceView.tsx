import type { Doc } from "@academic-reader/convex/data-model";
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
import { SourceDebugOverlayLayer } from "./DocumentDebug";
import {
	EmptyPane,
	errorMessage,
	PaneSkeleton,
	RetryMessage,
} from "./document-page-ui";

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
	pages: Doc<"pages">[] | undefined;
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	sourceAccess: SourceAccess | undefined;
	sourceAccessLoading: boolean;
	sourceAccessError: unknown;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onRetrySourceAccess: () => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	return (
		<div class="h-full overflow-auto bg-stone-900 p-4 pt-14 lg:pt-4">
			<Show
				when={props.document && props.pages !== undefined}
				fallback={<PaneSkeleton />}
			>
				<Show
					when={props.sourceAccess}
					fallback={
						<Show when={!props.sourceAccessLoading} fallback={<PaneSkeleton />}>
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
							when={props.document?.mimeType === "application/pdf"}
							fallback={
								<ImageSourceView
									activeDebugBlockId={props.activeDebugBlockId}
									blocks={props.blocks}
									debugEnabled={props.debugEnabled}
									debugEvents={props.debugEvents}
									document={props.document}
									mimeType={props.document?.mimeType ?? ""}
									pages={props.pages ?? []}
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
								document={props.document}
								pages={props.pages ?? []}
								tableOfContentsEntries={props.tableOfContentsEntries}
								url={sourceAccess().url}
								onHoverDebugBlock={props.onHoverDebugBlock}
								onShowReader={props.onShowReader}
							/>
						</Show>
					)}
				</Show>
			</Show>
		</div>
	);
}

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
	pages: Doc<"pages">[];
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	url: string;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	const [pdfDocument, setPdfDocument] = createSignal<PDFDocumentProxy>();
	const [error, setError] = createSignal<string>();
	const [loading, setLoading] = createSignal(true);
	const [zoom, setZoom] = createSignal(defaultPdfZoom);
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
			<Show when={!loading()} fallback={<PaneSkeleton />}>
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
						<div class="min-w-full">
							<div class="sticky top-2 z-20 mb-3 flex justify-end">
								<div class="inline-flex items-center overflow-hidden rounded-full border border-stone-700 bg-stone-950/85 text-sm shadow-lg backdrop-blur">
									<button
										class="px-3 py-1.5 text-stone-100 hover:bg-stone-800 disabled:text-stone-600"
										disabled={zoom() <= minPdfZoom}
										type="button"
										onClick={() =>
											setZoom((value) =>
												Math.max(minPdfZoom, value - pdfZoomStep),
											)
										}
									>
										−
									</button>
									<button
										class="border-stone-700 border-x px-3 py-1.5 text-stone-300 hover:bg-stone-800"
										type="button"
										onClick={() => setZoom(1)}
									>
										Fit
									</button>
									<span class="min-w-14 px-3 py-1.5 text-center text-stone-400">
										{Math.round(zoom() * 100)}%
									</span>
									<button
										class="border-stone-700 border-l px-3 py-1.5 text-stone-100 hover:bg-stone-800 disabled:text-stone-600"
										disabled={zoom() >= maxPdfZoom}
										type="button"
										onClick={() =>
											setZoom((value) =>
												Math.min(maxPdfZoom, value + pdfZoomStep),
											)
										}
									>
										+
									</button>
								</div>
							</div>
							<div class="flex min-w-full flex-col items-center gap-5">
								<For each={pageNumbers()}>
									{(pageNumber) => (
										<PdfPageCanvas
											activeDebugBlockId={props.activeDebugBlockId}
											blocks={props.blocks}
											debugEnabled={props.debugEnabled}
											debugEvents={props.debugEvents}
											document={props.document}
											pageLabel={
												pageByPhysicalPageNumber().get(pageNumber)?.pageLabel
											}
											pageNumber={pageNumber}
											tableOfContentsEntries={props.tableOfContentsEntries}
											pdfDocument={pdf()}
											zoom={zoom()}
											onHoverDebugBlock={props.onHoverDebugBlock}
											onShowReader={props.onShowReader}
										/>
									)}
								</For>
							</div>
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
	pageLabel: string | undefined;
	pdfDocument: PDFDocumentProxy;
	pageNumber: number;
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	zoom: number;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	let container: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let renderTask: RenderTask | undefined;
	const [page, setPage] = createSignal<PDFPageProxy>();
	const [width, setWidth] = createSignal(0);
	const [height, setHeight] = createSignal(0);
	const [displayWidth, setDisplayWidth] = createSignal(0);
	const [error, setError] = createSignal<string>();

	onMount(() => {
		if (!container) return;

		const resizeObserver = new ResizeObserver(([entry]) => {
			setWidth(entry.contentRect.width);
		});
		resizeObserver.observe(container);
		onCleanup(() => resizeObserver.disconnect());
	});

	createEffect(() => {
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

		if (renderTask) {
			renderTask.cancel();
			renderTask = undefined;
		}

		const baseViewport = loadedPage.getViewport({ scale: 1 });
		const targetWidth = fitWidth * props.zoom;
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
			<div class="mb-2 text-center text-stone-500 text-xs">
				{sourcePageTitle(props.pageNumber, props.pageLabel)}
			</div>
			<div
				class="relative mx-auto bg-white shadow-xl shadow-black/30"
				style={{ width: `${displayWidth()}px` }}
			>
				<Show when={error()}>
					{(message) => (
						<p class="absolute inset-x-0 top-0 z-10 bg-red-950/90 p-2 text-red-200 text-sm">
							{message()}
						</p>
					)}
				</Show>
				<div
					class="relative overflow-hidden"
					style={{ height: `${height()}px` }}
				>
					<canvas ref={canvas} class="block" />
					<SourceDebugOverlayLayer
						activeDebugBlockId={props.activeDebugBlockId}
						blocks={props.blocks}
						debugEnabled={props.debugEnabled}
						debugEvents={props.debugEvents}
						document={props.document}
						pageNumber={props.pageNumber}
						tableOfContentsEntries={props.tableOfContentsEntries}
						onHoverDebugBlock={props.onHoverDebugBlock}
						onShowReader={props.onShowReader}
					/>
				</div>
			</div>
		</div>
	);
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
	mimeType: string;
	pages: Doc<"pages">[];
	tableOfContentsEntries: Doc<"tableOfContentsEntries">[] | undefined;
	url: string;
	onHoverDebugBlock: (blockId: string | undefined) => void;
	onShowReader: (block: Doc<"blocks">) => void;
}) {
	const pageNumber = createMemo(() => props.pages[0]?.physicalPageNumber ?? 1);

	return (
		<div class="relative mx-auto max-w-5xl overflow-hidden bg-white shadow-xl shadow-black/30">
			<Show
				when={props.mimeType === "image/tiff"}
				fallback={
					<img alt="Source Document" class="block w-full" src={props.url} />
				}
			>
				<TiffCanvas url={props.url} />
			</Show>
			<SourceDebugOverlayLayer
				activeDebugBlockId={props.activeDebugBlockId}
				blocks={props.blocks}
				debugEnabled={props.debugEnabled}
				debugEvents={props.debugEvents}
				document={props.document}
				pageNumber={pageNumber()}
				tableOfContentsEntries={props.tableOfContentsEntries}
				onHoverDebugBlock={props.onHoverDebugBlock}
				onShowReader={props.onShowReader}
			/>
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
