import { api } from "@academic-reader/convex/api";
import type { Doc, Id } from "@academic-reader/convex/data-model";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery } from "convex-solidjs";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import * as UTIF from "utif";
import { AuthPanel } from "../../features/auth/AuthPanel";
import { ProcessingEventsPanel } from "../../features/documents/ProcessingEventsPanel";
import { authClient } from "../../lib/auth-client";
import { useConvexAuth } from "../../providers/convex";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const Route = createFileRoute("/documents/$documentId")({
	component: DocumentRoute,
});

interface SourceAccess {
	url: string;
	expiresAt: string;
	filename: string;
	mimeType: string;
}

interface ImageAccess {
	urls: Record<string, string>;
	expiresAt: string;
}

function DocumentRoute() {
	const params = Route.useParams();
	const session = authClient.useSession();
	const convexAuth = useConvexAuth();
	const [activeMobileView, setActiveMobileView] = createSignal<
		"source" | "reader"
	>("source");
	const [eventsOpen, setEventsOpen] = createSignal(false);
	const documentId = createMemo(() => params().documentId as Id<"documents">);
	const document = useQuery(
		api.api.documents.get,
		() => ({ documentId: documentId() }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const pages = useQuery(
		api.api.pages.listForDocument,
		() => ({ documentId: documentId() }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const blocks = useQuery(
		api.api.blocks.listForDocument,
		() => ({ documentId: documentId() }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const [sourceAccess, { refetch: refetchSourceAccess }] = createResource(
		() => (convexAuth.isAuthenticated() ? documentId() : undefined),
		fetchSourceAccess,
	);

	return (
		<main class="h-screen overflow-hidden bg-stone-950 text-stone-100">
			<Show
				when={!session().isPending}
				fallback={
					<FullPageMessage
						title="Checking session"
						body="Preparing Academic Reader…"
					/>
				}
			>
				<Show
					when={session().data?.user}
					fallback={
						<div class="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6">
							<FullPageMessage
								title="Sign in to open this Document"
								body="Documents are private to each Reader."
							/>
							<AuthPanel />
						</div>
					}
				>
					<Show
						when={convexAuth.isAuthenticated()}
						fallback={
							<FullPageMessage
								title="Finishing sign-in"
								body="Connecting to Academic Reader…"
							/>
						}
					>
						<Show
							when={!document.error() && !pages.error() && !blocks.error()}
							fallback={
								<FullPageMessage
									title="Could not open Document"
									body={
										document.error()?.message ??
										pages.error()?.message ??
										blocks.error()?.message ??
										"The Document could not be loaded."
									}
								/>
							}
						>
							<div class="relative h-screen overflow-hidden">
								<Link
									class="fixed top-3 left-3 z-30 rounded-full border border-stone-700 bg-stone-950/80 px-3 py-1.5 text-sm text-stone-200 shadow-lg backdrop-blur hover:bg-stone-900"
									to="/"
								>
									←
								</Link>

								<div class="fixed top-3 left-1/2 z-30 grid -translate-x-1/2 grid-cols-2 rounded-full border border-stone-700 bg-stone-950/80 p-1 text-sm shadow-lg backdrop-blur lg:hidden">
									<button
										class={mobileViewButtonClass(
											activeMobileView() === "source",
										)}
										type="button"
										onClick={() => setActiveMobileView("source")}
									>
										Source
									</button>
									<button
										class={mobileViewButtonClass(
											activeMobileView() === "reader",
										)}
										type="button"
										onClick={() => setActiveMobileView("reader")}
									>
										Reader
									</button>
								</div>

								<div class="grid h-full lg:grid-cols-2">
									<section class={paneClass(activeMobileView() === "source")}>
										<SourceView
											document={document.data()}
											pages={pages.data()}
											sourceAccess={sourceAccess()}
											sourceAccessError={sourceAccess.error}
											sourceAccessLoading={sourceAccess.loading}
											onRetrySourceAccess={refetchSourceAccess}
										/>
									</section>

									<section class={paneClass(activeMobileView() === "reader")}>
										<ReaderView
											blocks={blocks.data()}
											documentId={documentId()}
										/>
									</section>
								</div>

								<button
									class="fixed right-4 bottom-4 z-30 rounded-full border border-stone-700 bg-stone-950/85 px-4 py-2 text-sm text-stone-100 shadow-lg backdrop-blur hover:bg-stone-900"
									type="button"
									onClick={() => setEventsOpen(true)}
								>
									Events
								</button>

								<EventsDrawer
									document={document.data()}
									documentId={documentId()}
									open={eventsOpen()}
									onClose={() => setEventsOpen(false)}
								/>
							</div>
						</Show>
					</Show>
				</Show>
			</Show>
		</main>
	);
}

function SourceView(props: {
	document: Doc<"documents"> | undefined;
	pages: Doc<"pages">[] | undefined;
	sourceAccess: SourceAccess | undefined;
	sourceAccessLoading: boolean;
	sourceAccessError: unknown;
	onRetrySourceAccess: () => void;
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
									mimeType={props.document?.mimeType ?? ""}
									pages={props.pages ?? []}
									url={sourceAccess().url}
								/>
							}
						>
							<PdfSourceView
								pages={props.pages ?? []}
								url={sourceAccess().url}
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

function PdfSourceView(props: { url: string; pages: Doc<"pages">[] }) {
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
											pageNumber={pageNumber}
											pdfDocument={pdf()}
											zoom={zoom()}
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
	pdfDocument: PDFDocumentProxy;
	pageNumber: number;
	zoom: number;
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
					<div
						class="pointer-events-none absolute inset-0"
						data-page-number={props.pageNumber}
						data-source-overlay-layer=""
					/>
				</div>
			</div>
		</div>
	);
}

function ImageSourceView(props: {
	url: string;
	mimeType: string;
	pages: Doc<"pages">[];
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
			<div
				class="pointer-events-none absolute inset-0"
				data-page-number={pageNumber()}
				data-source-overlay-layer=""
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

function ReaderView(props: {
	documentId: Id<"documents">;
	blocks: Doc<"blocks">[] | undefined;
}) {
	const imageFilenames = createMemo(() => {
		if (props.blocks === undefined) return undefined;
		return extractBlockImageFilenames(props.blocks, props.documentId);
	});
	const [imageAccess] = createResource(() => {
		const filenames = imageFilenames();
		if (filenames === undefined || filenames.length === 0) return undefined;
		return { documentId: props.documentId, filenames };
	}, fetchImageAccess);
	const imageUrls = createMemo(() => {
		const filenames = imageFilenames();
		if (filenames === undefined) return undefined;
		if (filenames.length === 0 || imageAccess.error) return {};
		return imageAccess()?.urls;
	});
	const renderedBlocks = createMemo(() => {
		const urls = imageUrls();
		if (props.blocks === undefined || urls === undefined) return undefined;

		return props.blocks.map((block) => ({
			...block,
			contentHtml: rewriteBlockImageUrls(
				block.contentHtml,
				props.documentId,
				urls,
			),
		}));
	});

	return (
		<div class="reader-view h-full overflow-y-auto bg-stone-950 p-6 pt-16 lg:p-10">
			<Show when={imageAccess.error}>
				<p class="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 text-sm">
					Some Block images could not be signed for direct storage access.
				</p>
			</Show>
			<Show when={renderedBlocks() !== undefined} fallback={<PaneSkeleton />}>
				<Show
					when={renderedBlocks()?.length}
					fallback={
						<EmptyPane
							title="No Blocks yet"
							body="Reader View will appear after conversion persists Blocks."
						/>
					}
				>
					<div class="mx-auto max-w-3xl">
						<For each={renderedBlocks()}>
							{(block) => (
								<article
									data-block-id={block.blockId}
									data-block-type={block.blockType}
									data-page-number={block.pageNumber}
									innerHTML={block.contentHtml}
								/>
							)}
						</For>
					</div>
				</Show>
			</Show>
		</div>
	);
}

function EventsDrawer(props: {
	open: boolean;
	documentId: Id<"documents">;
	document: Doc<"documents"> | undefined;
	onClose: () => void;
}) {
	return (
		<aside
			class={`fixed inset-y-0 right-0 z-40 w-full max-w-md border-stone-800 border-l bg-stone-950 p-4 shadow-2xl shadow-black/50 transition-transform duration-200 ${
				props.open ? "translate-x-0" : "translate-x-full"
			}`}
		>
			<div class="flex items-center justify-between gap-4">
				<h2 class="font-semibold text-lg">Processing Events</h2>
				<button
					class="rounded-full border border-stone-700 px-3 py-1 text-stone-300 text-sm hover:bg-stone-900"
					type="button"
					onClick={props.onClose}
				>
					Close
				</button>
			</div>
			<div class="h-[calc(100%-3rem)] overflow-y-auto">
				<ProcessingEventsPanel
					documentId={props.documentId}
					isLive={props.document?.processingStatus === "processing"}
				/>
			</div>
		</aside>
	);
}

function PaneSkeleton() {
	return (
		<div class="space-y-4">
			<div class="h-64 animate-pulse rounded-2xl bg-stone-800" />
			<div class="h-64 animate-pulse rounded-2xl bg-stone-800/70" />
		</div>
	);
}

function EmptyPane(props: { title: string; body: string | undefined }) {
	return (
		<div class="m-8 rounded-2xl border border-stone-800 bg-stone-900/50 p-8 text-center">
			<h3 class="font-semibold text-xl">{props.title}</h3>
			<p class="mt-2 text-stone-500">{props.body}</p>
		</div>
	);
}

function RetryMessage(props: {
	title: string;
	body: string;
	onRetry: () => void;
}) {
	return (
		<div class="m-8 rounded-2xl border border-stone-800 bg-stone-900/50 p-8 text-center">
			<h3 class="font-semibold text-xl">{props.title}</h3>
			<p class="mt-2 text-stone-500">{props.body}</p>
			<button
				class="mt-5 rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950"
				type="button"
				onClick={props.onRetry}
			>
				Retry
			</button>
		</div>
	);
}

function FullPageMessage(props: { title: string; body: string }) {
	return (
		<section class="m-auto w-full max-w-3xl rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
			<h1 class="text-2xl font-semibold">{props.title}</h1>
			<p class="mt-3 text-stone-400">{props.body}</p>
		</section>
	);
}

async function fetchSourceAccess(documentId: Id<"documents">) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Source View access");

	const response = await fetch(
		`/api/documents/${encodeURIComponent(documentId)}/source-url`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error || "Could not create Source View URL");
	}

	return payload as SourceAccess;
}

async function fetchImageAccess(input: {
	documentId: Id<"documents">;
	filenames: string[];
}) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Block image access");

	const response = await fetch(
		`/api/documents/${encodeURIComponent(input.documentId)}/image-urls`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ filenames: input.filenames }),
		},
	);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error || "Could not create Block image URLs");
	}

	return payload as ImageAccess;
}

function loadPdfDocument(url: string) {
	return pdfjs.getDocument({ url }).promise;
}

function extractBlockImageFilenames(
	blocks: Doc<"blocks">[],
	documentId: string,
) {
	const filenames = new Set<string>();

	for (const block of blocks) {
		for (const src of imageSources(block.contentHtml)) {
			const filename = documentImageFilename(documentId, src);
			if (filename) filenames.add(filename);
		}
	}

	return Array.from(filenames).sort();
}

function rewriteBlockImageUrls(
	html: string,
	documentId: string,
	imageUrls: Record<string, string>,
) {
	return html.replace(
		/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi,
		(match, prefix: string, quote: string, src: string) => {
			const filename = documentImageFilename(documentId, src);
			const url = filename ? imageUrls[filename] : undefined;
			if (!url) return match;

			return `${prefix}${quote}${escapeAttributeValue(url, quote)}${quote}`;
		},
	);
}

function imageSources(html: string) {
	const sources: string[] = [];
	const pattern = /<img\b[^>]*\bsrc=(["'])([^"']+)\1/gi;
	let match = pattern.exec(html);

	while (match) {
		sources.push(match[2]);
		match = pattern.exec(html);
	}

	return sources;
}

function documentImageFilename(documentId: string, src: string) {
	let pathname: string;
	try {
		pathname = new URL(src, window.location.origin).pathname;
	} catch {
		return undefined;
	}

	const match = pathname.match(/^\/api\/documents\/([^/]+)\/images\/(.+)$/);
	if (!match) return undefined;
	if (decodeURIComponent(match[1]) !== documentId) return undefined;
	return decodeURIComponent(match[2]);
}

function escapeAttributeValue(value: string, quote: string) {
	let escaped = value.replaceAll("&", "&amp;");
	if (quote === '"') escaped = escaped.replaceAll('"', "&quot;");
	else escaped = escaped.replaceAll("'", "&#39;");
	return escaped;
}

function paneClass(isActiveMobileView: boolean) {
	return `${isActiveMobileView ? "block" : "hidden"} h-full min-h-0 lg:block`;
}

function mobileViewButtonClass(isActive: boolean) {
	return isActive
		? "rounded-full bg-amber-300 px-3 py-1 font-medium text-stone-950"
		: "rounded-full px-3 py-1 text-stone-400";
}

function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: String(error || "Unknown error");
}
