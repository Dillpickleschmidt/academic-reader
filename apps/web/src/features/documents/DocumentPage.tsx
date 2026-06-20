import { api } from "@academic-reader/convex/api";
import type { Doc, Id } from "@academic-reader/convex/data-model";
import { Link } from "@tanstack/solid-router";
import { useQuery } from "convex-solidjs";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Show,
} from "solid-js";
import { authClient } from "../../lib/auth-client";
import { fetchJson } from "../../lib/fetch-json";
import { useConvexAuth } from "../../providers/convex";
import { AuthPanel } from "../auth/AuthPanel";
import {
	DebugStatsPanel,
	debugToggleButtonClass,
	readerBlockElementId,
	scrollElementTopIntoNearestScroller,
	sourceBlockElementId,
} from "./DocumentDebug";
import { DocumentProcessing } from "./DocumentProcessing";
import { ReaderView } from "./DocumentReaderView";
import { type SourceAccess, SourceView } from "./DocumentSourceView";
import { TableOfContentsDrawer } from "./DocumentTableOfContents";
import { FullPageMessage } from "./document-page-ui";

export function DocumentPage(props: { documentId: Id<"documents"> }) {
	const session = authClient.useSession();
	const convexAuth = useConvexAuth();
	const [activeMobileView, setActiveMobileView] = createSignal<
		"source" | "reader"
	>("source");
	const [tableOfContentsOpen, setTableOfContentsOpen] = createSignal(false);
	const [eventsOpen, setEventsOpen] = createSignal(false);
	const [debugEnabled, setDebugEnabled] = createSignal(false);
	const [hoveredDebugBlockId, setHoveredDebugBlockId] = createSignal<string>();
	const document = useQuery(
		api.api.documents.get,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);
	const pages = useQuery(
		api.api.pages.listForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);
	const blocks = useQuery(
		api.api.blocks.listForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);
	const tableOfContentsEntries = useQuery(
		api.api.tableOfContentsEntries.listTableOfContentsEntriesForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);
	const debugEvents = useQuery(
		api.api.processingEvents.listForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated() && debugEnabled(),
			keepPreviousData: true,
		}),
	);
	const narrationAudioArgs = createMemo(
		() => {
			const narration = document.data()?.processingConfiguration.narration;
			if (!narration?.enabled) return undefined;
			return { documentId: props.documentId, voice: narration.voice };
		},
		undefined,
		{
			equals: (previous, next) =>
				previous?.documentId === next?.documentId &&
				previous?.voice === next?.voice,
		},
	);
	const narrationAudio = useQuery(
		api.api.narrationAudio.listForDocument,
		() => narrationAudioArgs() ?? { documentId: props.documentId, voice: "" },
		() => ({
			enabled:
				convexAuth.isAuthenticated() && narrationAudioArgs() !== undefined,
			keepPreviousData: true,
		}),
	);
	const [sourceAccess, { refetch: refetchSourceAccess }] = createResource(
		() => (convexAuth.isAuthenticated() ? props.documentId : undefined),
		fetchSourceAccess,
	);

	createEffect(() => {
		if (debugEnabled()) return;
		setHoveredDebugBlockId(undefined);
	});

	function showBlockInSource(block: Doc<"blocks">) {
		setActiveMobileView("source");
		scrollElementTopIntoNearestScroller(sourceBlockElementId(block._id));
	}

	function showBlockInReader(block: Doc<"blocks">) {
		setActiveMobileView("reader");
		scrollElementTopIntoNearestScroller(readerBlockElementId(block._id));
	}

	return (
		<main class="h-screen overflow-hidden bg-background text-foreground">
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
									class="fixed top-3 left-3 z-30 rounded-full border border-border bg-background/80 px-3 py-1.5 text-sm text-foreground shadow-lg backdrop-blur hover:bg-card"
									to="/"
								>
									←
								</Link>

								<div class="fixed top-3 left-1/2 z-30 grid -translate-x-1/2 grid-cols-2 rounded-full border border-border bg-background/80 p-1 text-sm shadow-lg backdrop-blur lg:hidden">
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
											activeDebugBlockId={hoveredDebugBlockId()}
											blocks={blocks.data()}
											debugEnabled={debugEnabled()}
											debugEvents={debugEvents.data()}
											document={document.data()}
											narrationAudio={narrationAudio.data()}
											pages={pages.data()}
											tableOfContentsEntries={tableOfContentsEntries.data()}
											sourceAccess={sourceAccess()}
											sourceAccessError={sourceAccess.error}
											sourceAccessLoading={sourceAccess.loading}
											onHoverDebugBlock={setHoveredDebugBlockId}
											onRetrySourceAccess={refetchSourceAccess}
											onShowReader={showBlockInReader}
										/>
									</section>

									<section class={paneClass(activeMobileView() === "reader")}>
										<ReaderView
											activeDebugBlockId={hoveredDebugBlockId()}
											blocks={blocks.data()}
											debugEnabled={debugEnabled()}
											debugEvents={debugEvents.data()}
											document={document.data()}
											documentId={props.documentId}
											narrationAudio={narrationAudio.data()}
											onHoverDebugBlock={setHoveredDebugBlockId}
											onShowSource={showBlockInSource}
										/>
									</section>
								</div>

								<Show when={debugEnabled() && blocks.data()}>
									{(loadedBlocks) => (
										<DebugStatsPanel blocks={loadedBlocks()} />
									)}
								</Show>

								<div class="fixed right-4 bottom-4 z-30 flex gap-2">
									<button
										class="rounded-full border border-border bg-background/85 px-4 py-2 text-sm text-foreground shadow-lg backdrop-blur hover:bg-card"
										type="button"
										onClick={() => setTableOfContentsOpen(true)}
									>
										TOC
									</button>
									<button
										class={debugToggleButtonClass(debugEnabled())}
										type="button"
										onClick={() => setDebugEnabled((enabled) => !enabled)}
									>
										Debug
									</button>
									<button
										class="rounded-full border border-border bg-background/85 px-4 py-2 text-sm text-foreground shadow-lg backdrop-blur hover:bg-card"
										type="button"
										onClick={() => setEventsOpen(true)}
									>
										Events
									</button>
								</div>

								<TableOfContentsDrawer
									blocks={blocks.data()}
									entries={tableOfContentsEntries.data()}
									open={tableOfContentsOpen()}
									pages={pages.data()}
									onClose={() => setTableOfContentsOpen(false)}
									onShowReaderBlock={showBlockInReader}
								/>

								<EventsDrawer
									documentId={props.documentId}
									processingStatus={
										document.data()?.processingStatus ?? "processing"
									}
									narrationEnabled={
										document.data()?.processingConfiguration.narration
											.enabled ?? false
									}
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

function EventsDrawer(props: {
	open: boolean;
	documentId: Id<"documents">;
	processingStatus: string;
	narrationEnabled: boolean;
	onClose: () => void;
}) {
	return (
		<aside
			class={`fixed inset-y-0 right-0 z-40 w-full max-w-md border-border border-l bg-background p-4 shadow-2xl shadow-black/50 transition-transform duration-200 ${
				props.open ? "translate-x-0" : "translate-x-full"
			}`}
		>
			<div class="flex items-center justify-between gap-4">
				<h2 class="font-semibold text-lg">Processing</h2>
				<button
					class="rounded-full border border-border px-3 py-1 text-foreground text-sm hover:bg-card"
					type="button"
					onClick={props.onClose}
				>
					Close
				</button>
			</div>
			<div class="h-[calc(100%-3rem)] overflow-y-auto">
				<Show when={props.open}>
					<DocumentProcessing
						documentId={props.documentId}
						processingStatus={props.processingStatus}
						narrationEnabled={props.narrationEnabled}
					/>
				</Show>
			</div>
		</aside>
	);
}

async function fetchSourceAccess(documentId: Id<"documents">) {
	const { data } = await authClient.convex.token({
		fetchOptions: { throw: false },
	});
	const token = data?.token;
	if (!token) throw new Error("Could not authenticate Source View access");

	return fetchJson<SourceAccess>(
		`/api/documents/${encodeURIComponent(documentId)}/source-url`,
		{ headers: { Authorization: `Bearer ${token}` } },
		"Could not create Source View URL",
	);
}

function paneClass(isActiveMobileView: boolean) {
	return `${isActiveMobileView ? "block" : "hidden"} h-full min-h-0 lg:block`;
}

function mobileViewButtonClass(isActive: boolean) {
	return isActive
		? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
		: "rounded-full px-3 py-1 text-muted-foreground";
}
