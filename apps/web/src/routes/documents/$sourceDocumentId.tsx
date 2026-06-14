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
import { ProcessingEventsPanel } from "../../features/source-documents/ProcessingEventsPanel";
import { authClient } from "../../lib/auth-client";
import { useConvexAuth } from "../../providers/convex";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const Route = createFileRoute("/documents/$sourceDocumentId")({
	component: DocumentWorkbenchRoute,
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

function DocumentWorkbenchRoute() {
	const params = Route.useParams();
	const session = authClient.useSession();
	const convexAuth = useConvexAuth();
	const [activeMobileView, setActiveMobileView] = createSignal<
		"source" | "readable"
	>("source");
	const sourceDocumentId = createMemo(
		() => params().sourceDocumentId as Id<"sourceDocuments">,
	);
	const sourceDocument = useQuery(
		api.api.sourceDocuments.get,
		() => ({ sourceDocumentId: sourceDocumentId() }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const pages = useQuery(
		api.api.pages.listForSourceDocument,
		() => ({ sourceDocumentId: sourceDocumentId() }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const blocks = useQuery(
		api.api.blocks.listForSourceDocument,
		() => ({ sourceDocumentId: sourceDocumentId() }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const [sourceAccess, { refetch: refetchSourceAccess }] = createResource(
		() => (convexAuth.isAuthenticated() ? sourceDocumentId() : undefined),
		fetchSourceAccess,
	);

	return (
		<main class="flex h-screen flex-col overflow-hidden bg-stone-950 text-stone-100">
			<Show
				when={!session().isPending}
				fallback={
					<FullPageMessage
						title="Checking session"
						body="Preparing your workbench…"
					/>
				}
			>
				<Show
					when={session().data?.user}
					fallback={
						<div class="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6">
							<FullPageMessage
								title="Sign in to open this Source Document"
								body="Source Documents are private to each Reader."
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
								body="Connecting to your workbench…"
							/>
						}
					>
						<Show
							when={
								!sourceDocument.error() && !pages.error() && !blocks.error()
							}
							fallback={
								<FullPageMessage
									title="Could not open Source Document"
									body={
										sourceDocument.error()?.message ??
										pages.error()?.message ??
										blocks.error()?.message ??
										"The Source Document could not be loaded."
									}
								/>
							}
						>
							<WorkbenchShell
								activeMobileView={activeMobileView()}
								blocks={blocks.data()}
								pages={pages.data()}
								sourceAccess={sourceAccess()}
								sourceAccessError={sourceAccess.error}
								sourceAccessLoading={sourceAccess.loading}
								sourceDocument={sourceDocument.data()}
								sourceDocumentId={sourceDocumentId()}
								onMobileViewChange={setActiveMobileView}
								onRetrySourceAccess={refetchSourceAccess}
							/>
						</Show>
					</Show>
				</Show>
			</Show>
		</main>
	);
}

function WorkbenchShell(props: {
	activeMobileView: "source" | "readable";
	sourceDocumentId: Id<"sourceDocuments">;
	sourceDocument: Doc<"sourceDocuments"> | undefined;
	pages: Doc<"pages">[] | undefined;
	blocks: Doc<"blocks">[] | undefined;
	sourceAccess: SourceAccess | undefined;
	sourceAccessLoading: boolean;
	sourceAccessError: unknown;
	onRetrySourceAccess: () => void;
	onMobileViewChange: (view: "source" | "readable") => void;
}) {
	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<header class="shrink-0 border-stone-800 border-b px-4 py-4 md:px-6">
				<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div class="min-w-0">
						<Link class="text-sm text-stone-400 hover:text-amber-200" to="/">
							← Source Documents
						</Link>
						<Show
							when={props.sourceDocument}
							fallback={
								<div class="mt-3 h-8 w-72 animate-pulse rounded bg-stone-800" />
							}
						>
							{(sourceDocument) => (
								<div class="mt-2 min-w-0">
									<h1 class="truncate font-semibold text-2xl">
										{sourceDocument().filename}
									</h1>
									<p class="mt-1 text-sm text-stone-500">
										{sourceDocument().mimeType} ·{" "}
										{formatBytes(sourceDocument().sizeBytes)}
									</p>
								</div>
							)}
						</Show>
					</div>

					<div class="flex flex-wrap items-center gap-2 text-sm">
						<Show when={props.sourceDocument}>
							{(sourceDocument) => (
								<span class="rounded-full border border-stone-700 px-3 py-1 text-stone-300">
									{sourceDocument().processingStatus}
								</span>
							)}
						</Show>
						<Show when={props.pages !== undefined}>
							<span class="rounded-full border border-stone-800 px-3 py-1 text-stone-500">
								{props.pages?.length ?? 0} Pages
							</span>
						</Show>
						<Show when={props.blocks !== undefined}>
							<span class="rounded-full border border-stone-800 px-3 py-1 text-stone-500">
								{props.blocks?.length ?? 0} Blocks
							</span>
						</Show>
					</div>
				</div>

				<div class="mt-4 grid grid-cols-2 rounded-xl border border-stone-800 p-1 lg:hidden">
					<button
						class={mobileViewButtonClass(props.activeMobileView === "source")}
						type="button"
						onClick={() => props.onMobileViewChange("source")}
					>
						Source View
					</button>
					<button
						class={mobileViewButtonClass(props.activeMobileView === "readable")}
						type="button"
						onClick={() => props.onMobileViewChange("readable")}
					>
						Readable View
					</button>
				</div>
			</header>

			<div class="grid min-h-0 flex-1 lg:grid-cols-2">
				<section class={paneClass(props.activeMobileView === "source")}>
					<PaneHeader eyebrow="Source View" title="Original Source Document" />
					<SourceView
						pages={props.pages}
						sourceAccess={props.sourceAccess}
						sourceAccessError={props.sourceAccessError}
						sourceAccessLoading={props.sourceAccessLoading}
						sourceDocument={props.sourceDocument}
						onRetrySourceAccess={props.onRetrySourceAccess}
					/>
				</section>

				<section class={paneClass(props.activeMobileView === "readable")}>
					<PaneHeader eyebrow="Readable View" title="Blocks projection" />
					<ReadableView
						blocks={props.blocks}
						sourceDocumentId={props.sourceDocumentId}
					/>
				</section>
			</div>

			<div class="max-h-80 shrink-0 overflow-y-auto border-stone-800 border-t px-4 py-4 md:px-6">
				<ProcessingEventsPanel
					isLive={props.sourceDocument?.processingStatus === "processing"}
					sourceDocumentId={props.sourceDocumentId}
				/>
			</div>
		</div>
	);
}

function SourceView(props: {
	sourceDocument: Doc<"sourceDocuments"> | undefined;
	pages: Doc<"pages">[] | undefined;
	sourceAccess: SourceAccess | undefined;
	sourceAccessLoading: boolean;
	sourceAccessError: unknown;
	onRetrySourceAccess: () => void;
}) {
	return (
		<div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
			<Show
				when={props.sourceDocument && props.pages !== undefined}
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
							when={props.sourceDocument?.mimeType === "application/pdf"}
							fallback={
								<ImageSourceView
									mimeType={props.sourceDocument?.mimeType ?? ""}
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

function PdfSourceView(props: { url: string; pages: Doc<"pages">[] }) {
	const [pdfDocument, setPdfDocument] = createSignal<PDFDocumentProxy>();
	const [error, setError] = createSignal<string>();
	const [loading, setLoading] = createSignal(true);
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
						<div class="mx-auto flex max-w-5xl flex-col gap-6">
							<For each={pageNumbers()}>
								{(pageNumber) => (
									<PdfPageCanvas pageNumber={pageNumber} pdfDocument={pdf()} />
								)}
							</For>
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
}) {
	let container: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let renderTask: RenderTask | undefined;
	const [page, setPage] = createSignal<PDFPageProxy>();
	const [width, setWidth] = createSignal(0);
	const [height, setHeight] = createSignal(0);
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
		const targetWidth = width();
		if (!loadedPage || !canvas || targetWidth <= 0) return;

		if (renderTask) {
			renderTask.cancel();
			renderTask = undefined;
		}

		const baseViewport = loadedPage.getViewport({ scale: 1 });
		const cssScale = targetWidth / baseViewport.width;
		const outputScale = cssScale * window.devicePixelRatio;
		const viewport = loadedPage.getViewport({ scale: outputScale });
		const cssHeight = baseViewport.height * cssScale;
		const context = canvas.getContext("2d");

		if (!context) {
			setError("Could not create PDF canvas context");
			return;
		}

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
		<article class="rounded-2xl border border-stone-800 bg-stone-900/40 p-3 shadow-2xl shadow-black/30">
			<div class="mb-2 flex items-center justify-between px-1 text-xs text-stone-500">
				<span>Physical Page {props.pageNumber}</span>
				<Show when={error()}>
					{(message) => <span class="text-red-300">{message()}</span>}
				</Show>
			</div>
			<div
				ref={container}
				class="relative w-full overflow-hidden rounded-xl bg-white"
			>
				<div style={{ height: `${height()}px` }}>
					<canvas ref={canvas} class="block" />
					<div
						class="pointer-events-none absolute inset-0"
						data-page-number={props.pageNumber}
						data-source-overlay-layer=""
					/>
				</div>
			</div>
		</article>
	);
}

function ImageSourceView(props: {
	url: string;
	mimeType: string;
	pages: Doc<"pages">[];
}) {
	const pageNumber = createMemo(() => props.pages[0]?.physicalPageNumber ?? 1);

	return (
		<div class="mx-auto max-w-5xl rounded-2xl border border-stone-800 bg-stone-900/40 p-3 shadow-2xl shadow-black/30">
			<div class="mb-2 px-1 text-xs text-stone-500">
				Physical Page {pageNumber()}
			</div>
			<div class="relative overflow-hidden rounded-xl bg-white">
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
				if (!response.ok)
					throw new Error("Could not load TIFF Source Document");
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

function ReadableView(props: {
	sourceDocumentId: Id<"sourceDocuments">;
	blocks: Doc<"blocks">[] | undefined;
}) {
	const imageFilenames = createMemo(() => {
		if (props.blocks === undefined) return undefined;
		return extractBlockImageFilenames(props.blocks, props.sourceDocumentId);
	});
	const [imageAccess] = createResource(() => {
		const filenames = imageFilenames();
		if (filenames === undefined || filenames.length === 0) return undefined;
		return { sourceDocumentId: props.sourceDocumentId, filenames };
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
				props.sourceDocumentId,
				urls,
			),
		}));
	});

	return (
		<div class="readable-view min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
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
							body="Readable View will appear after conversion persists Blocks."
						/>
					}
				>
					<div class="mx-auto max-w-3xl rounded-2xl border border-stone-800 bg-stone-950 px-5 py-8 md:px-8">
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

function PaneHeader(props: { eyebrow: string; title: string }) {
	return (
		<div class="shrink-0 border-stone-800 border-b px-4 py-3 md:px-6">
			<p class="font-medium text-amber-300 text-xs tracking-[0.18em] uppercase">
				{props.eyebrow}
			</p>
			<h2 class="mt-1 font-semibold text-lg">{props.title}</h2>
		</div>
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
		<div class="rounded-2xl border border-stone-800 bg-stone-900/50 p-8 text-center">
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
		<div class="rounded-2xl border border-stone-800 bg-stone-900/50 p-8 text-center">
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

async function fetchSourceAccess(sourceDocumentId: Id<"sourceDocuments">) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Source View access");

	const response = await fetch(
		`/api/source-documents/${encodeURIComponent(sourceDocumentId)}/source-url`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(payload.error || "Could not create Source View URL");
	}

	return payload as SourceAccess;
}

async function fetchImageAccess(input: {
	sourceDocumentId: Id<"sourceDocuments">;
	filenames: string[];
}) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Block image access");

	const response = await fetch(
		`/api/source-documents/${encodeURIComponent(input.sourceDocumentId)}/image-urls`,
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

async function loadPdfDocument(url: string) {
	const response = await fetch(url);
	if (!response.ok) throw new Error("Could not load PDF Source Document");
	const data = await response.arrayBuffer();
	return pdfjs.getDocument({ data }).promise;
}

function extractBlockImageFilenames(
	blocks: Doc<"blocks">[],
	sourceDocumentId: string,
) {
	const filenames = new Set<string>();

	for (const block of blocks) {
		for (const src of imageSources(block.contentHtml)) {
			const filename = sourceDocumentImageFilename(sourceDocumentId, src);
			if (filename) filenames.add(filename);
		}
	}

	return Array.from(filenames).sort();
}

function rewriteBlockImageUrls(
	html: string,
	sourceDocumentId: string,
	imageUrls: Record<string, string>,
) {
	return html.replace(
		/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi,
		(match, prefix: string, quote: string, src: string) => {
			const filename = sourceDocumentImageFilename(sourceDocumentId, src);
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

function sourceDocumentImageFilename(sourceDocumentId: string, src: string) {
	let pathname: string;
	try {
		pathname = new URL(src, window.location.origin).pathname;
	} catch {
		return undefined;
	}

	const match = pathname.match(
		/^\/api\/source-documents\/([^/]+)\/images\/(.+)$/,
	);
	if (!match) return undefined;
	if (decodeURIComponent(match[1]) !== sourceDocumentId) return undefined;
	return decodeURIComponent(match[2]);
}

function escapeAttributeValue(value: string, quote: string) {
	let escaped = value.replaceAll("&", "&amp;");
	if (quote === '"') escaped = escaped.replaceAll('"', "&quot;");
	else escaped = escaped.replaceAll("'", "&#39;");
	return escaped;
}

function paneClass(isActiveMobileView: boolean) {
	return `${isActiveMobileView ? "flex" : "hidden"} min-h-0 flex-col border-stone-800 lg:flex lg:border-r`;
}

function mobileViewButtonClass(isActive: boolean) {
	return isActive
		? "rounded-lg bg-amber-300 px-3 py-2 font-medium text-stone-950"
		: "rounded-lg px-3 py-2 text-stone-400";
}

function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: String(error || "Unknown error");
}
