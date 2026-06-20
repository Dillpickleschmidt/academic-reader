import type { Id } from "@academic-reader/convex/data-model";
import { readerViewReady } from "@academic-reader/shared/processing-phases";
import { Link } from "@tanstack/solid-router";
import { createSignal, For, type JSX, Show } from "solid-js";
import { authClient } from "../../lib/auth-client";
import { fetchJson } from "../../lib/fetch-json";
import { AuthPanel } from "../auth/AuthPanel";
import { AddDocumentButton, UploadPrompt } from "./DocumentCreationFlow";
import { DocumentProcessing } from "./DocumentProcessing";
import type { DocumentCreation } from "./document-creation";
import { createStableItems } from "./document-stable-list";

type DocumentListItem = {
	_id: Id<"documents">;
	filename: string;
	processingStatus: string;
	updatedAt: number;
	active: boolean;
	pageCount: number | null;
	processingConfiguration: { narration: { enabled: boolean } };
};

export function SignedOutDocuments(props: { creation: DocumentCreation }) {
	return (
		<div>
			<Wordmark />
			<h1 class="mt-4 max-w-2xl font-semibold text-4xl tracking-tight sm:text-5xl">
				Read papers, and hear them.
			</h1>
			<p class="mt-5 max-w-xl text-muted-foreground">
				Import a PDF or image, inspect how every block was understood, and play
				a clean narration. Your library stays private to you.
			</p>

			<div class="mt-10 max-w-xl">
				<UploadPrompt state={props.creation} />
			</div>

			<div class="mt-12 max-w-sm">
				<SectionLabel>Already reading here</SectionLabel>
				<div class="mt-3">
					<AuthPanel />
				</div>
			</div>
		</div>
	);
}

export function SignedInDocuments(props: {
	documents: Array<DocumentListItem> | undefined;
	error: Error | undefined;
	creation: DocumentCreation;
}) {
	const [openDocumentId, setOpenDocumentId] = createSignal<Id<"documents">>();
	const [deletingDocumentId, setDeletingDocumentId] =
		createSignal<Id<"documents">>();
	const [deleteError, setDeleteError] = createSignal<string>();
	const documents = createStableItems(
		() => props.documents,
		(document) => document._id,
		sameDocumentListItem,
	);
	const activeDocuments = () =>
		documents()?.filter((document) => document.active);
	const shelfDocuments = () =>
		documents()?.filter((document) => !document.active);

	async function deleteDocument(document: DocumentListItem) {
		const confirmed = window.confirm(
			`Permanently delete "${document.filename}"? This removes the Source Document, Reader View, Processing Events, images, and Narration audio.`,
		);
		if (!confirmed) return;

		setDeleteError(undefined);
		setDeletingDocumentId(document._id);

		try {
			const { data } = await authClient.convex.token({
				fetchOptions: { throw: false },
			});
			const token = data?.token;
			if (!token) throw new Error("Could not authenticate Document deletion");

			await fetchJson<{ deleted: true }>(
				`/api/documents/${encodeURIComponent(document._id)}`,
				{ method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
				"Could not delete Document",
			);
			if (openDocumentId() === document._id) setOpenDocumentId(undefined);
		} catch (error) {
			setDeleteError(
				error instanceof Error ? error.message : "Could not delete Document",
			);
		} finally {
			setDeletingDocumentId(undefined);
		}
	}

	async function signOut() {
		await authClient.signOut({
			fetchOptions: { onSuccess: () => window.location.reload() },
		});
	}

	return (
		<div>
			<header class="flex items-end justify-between gap-4">
				<div>
					<Wordmark />
					<h1 class="mt-2 font-semibold text-3xl tracking-tight">Library</h1>
				</div>
				<div class="flex shrink-0 items-center gap-5">
					<button
						class="font-mono text-dim text-xs uppercase tracking-[0.18em] hover:text-foreground"
						type="button"
						onClick={signOut}
					>
						Sign out
					</button>
					<AddDocumentButton state={props.creation} />
				</div>
			</header>

			<Show when={props.creation.error() && !props.creation.file()}>
				<p class="mt-4 text-destructive text-sm">{props.creation.error()}</p>
			</Show>
			<Show when={deleteError()}>
				{(message) => <p class="mt-4 text-destructive text-sm">{message()}</p>}
			</Show>

			<Show
				when={!props.error}
				fallback={<p class="mt-12 text-destructive">{props.error?.message}</p>}
			>
				<Show
					when={documents() !== undefined}
					fallback={<div class="mt-12 h-40 animate-pulse rounded-xl bg-card" />}
				>
					<Show
						when={documents()?.length}
						fallback={<EmptyLibrary creation={props.creation} />}
					>
						<Show when={activeDocuments()?.length}>
							<section class="mt-12">
								<SectionLabel>In progress</SectionLabel>
								<div class="border-border border-t">
									<For each={activeDocuments()}>
										{(document) => (
											<ActiveEntry
												document={document}
												busy={deletingDocumentId() !== undefined}
												deleting={deletingDocumentId() === document._id}
												onDelete={() => void deleteDocument(document)}
											/>
										)}
									</For>
								</div>
							</section>
						</Show>

						<Show when={shelfDocuments()?.length}>
							<section class="mt-12">
								<SectionLabel>
									Library · {shelfDocuments()?.length}
								</SectionLabel>
								<div class="border-border border-t">
									<For each={shelfDocuments()}>
										{(document) => (
											<ShelfEntry
												document={document}
												busy={deletingDocumentId() !== undefined}
												deleting={deletingDocumentId() === document._id}
												open={openDocumentId() === document._id}
												onDelete={() => void deleteDocument(document)}
												onToggle={() =>
													setOpenDocumentId(
														openDocumentId() === document._id
															? undefined
															: document._id,
													)
												}
											/>
										)}
									</For>
								</div>
							</section>
						</Show>
					</Show>
				</Show>
			</Show>
		</div>
	);
}

function ActiveEntry(props: {
	document: DocumentListItem;
	busy: boolean;
	deleting: boolean;
	onDelete: () => void;
}) {
	return (
		<article class="border-border border-b py-5">
			<div class="flex items-baseline justify-between gap-4">
				<TitleLink document={props.document} />
				<div class="flex shrink-0 items-center gap-4 font-mono text-xs">
					<Show
						when={readerViewReady(props.document.processingStatus)}
						fallback={<span class="text-dim">Open ↗</span>}
					>
						<Link
							class="text-primary hover:opacity-80"
							params={{ documentId: props.document._id }}
							to="/documents/$documentId"
						>
							Open ↗
						</Link>
					</Show>
					<button
						class="text-dim hover:text-destructive disabled:opacity-40"
						disabled={props.busy}
						type="button"
						onClick={props.onDelete}
					>
						{props.deleting ? "Deleting…" : "Delete"}
					</button>
				</div>
			</div>
			<DocumentProcessing
				bare
				documentId={props.document._id}
				processingStatus={props.document.processingStatus}
				narrationEnabled={
					props.document.processingConfiguration.narration.enabled
				}
			/>
		</article>
	);
}

function ShelfEntry(props: {
	document: DocumentListItem;
	busy: boolean;
	deleting: boolean;
	open: boolean;
	onDelete: () => void;
	onToggle: () => void;
}) {
	return (
		<div class="border-border border-b">
			<div class="group flex items-center justify-between gap-4 py-3.5">
				<TitleLink document={props.document} />
				<div class="flex shrink-0 items-center gap-4 font-mono text-dim text-xs">
					<Show when={shelfMeta(props.document)}>
						{(meta) => <span>{meta()}</span>}
					</Show>
					<button
						class="opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
						type="button"
						onClick={props.onToggle}
					>
						{props.open ? "Hide" : "Details"}
					</button>
					<button
						class="opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 disabled:opacity-30 group-hover:opacity-100"
						disabled={props.busy}
						type="button"
						onClick={props.onDelete}
					>
						{props.deleting ? "Deleting…" : "Delete"}
					</button>
					<Link
						class="hover:text-primary"
						params={{ documentId: props.document._id }}
						to="/documents/$documentId"
					>
						Open ↗
					</Link>
				</div>
			</div>
			<Show when={props.open}>
				<div class="pb-4">
					<DocumentProcessing
						bare
						documentId={props.document._id}
						processingStatus={props.document.processingStatus}
						narrationEnabled={
							props.document.processingConfiguration.narration.enabled
						}
					/>
				</div>
			</Show>
		</div>
	);
}

function TitleLink(props: { document: DocumentListItem }) {
	return (
		<Link
			class="truncate font-medium hover:text-primary"
			params={{ documentId: props.document._id }}
			to="/documents/$documentId"
		>
			{props.document.filename}
		</Link>
	);
}

function EmptyLibrary(props: { creation: DocumentCreation }) {
	return (
		<div class="mt-16 max-w-xl">
			<SectionLabel>Empty shelf</SectionLabel>
			<h2 class="mt-1 font-medium text-xl">Add your first paper</h2>
			<p class="mt-2 text-muted-foreground text-sm">
				Drop a PDF or image to import it, choose how it's processed, then start
				reading.
			</p>
			<div class="mt-6">
				<UploadPrompt state={props.creation} />
			</div>
		</div>
	);
}

function Wordmark() {
	return (
		<p class="font-mono text-dim text-xs uppercase tracking-[0.3em]">
			Academic Reader
		</p>
	);
}

function SectionLabel(props: { children: JSX.Element }) {
	return (
		<h2 class="mb-2 font-mono text-dim text-xs uppercase tracking-[0.25em]">
			{props.children}
		</h2>
	);
}

function shelfMeta(document: DocumentListItem): string {
	const parts: string[] = [];
	if (document.processingStatus === "readyWithWarnings") parts.push("warnings");
	if (document.pageCount) parts.push(`${document.pageCount} pp`);
	if (document.processingConfiguration.narration.enabled)
		parts.push("narrated");
	return parts.join(" · ");
}

function sameDocumentListItem(
	previous: DocumentListItem,
	next: DocumentListItem,
) {
	return (
		previous._id === next._id &&
		previous.filename === next.filename &&
		previous.processingStatus === next.processingStatus &&
		previous.active === next.active &&
		previous.pageCount === next.pageCount &&
		previous.updatedAt === next.updatedAt &&
		previous.processingConfiguration.narration.enabled ===
			next.processingConfiguration.narration.enabled
	);
}
