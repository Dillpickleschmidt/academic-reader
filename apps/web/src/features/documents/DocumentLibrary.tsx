import type { Id } from "@academic-reader/convex/data-model";
import { Link } from "@tanstack/solid-router";
import { createSignal, Index, Show } from "solid-js";
import { authClient } from "../../lib/auth-client";
import { UploadPrompt } from "./DocumentCreationFlow";
import type { DocumentCreation } from "./document-creation";
import { createStableItems } from "./document-stable-list";
import { ProcessingEventsPanel } from "./ProcessingEventsPanel";

export type DocumentListItem = {
	_id: Id<"documents">;
	filename: string;
	processingStatus: string;
	updatedAt: number;
};

export function SignedOutDocuments(props: { creation: DocumentCreation }) {
	return (
		<div class="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
			<section class="rounded-3xl border border-dashed border-stone-700 bg-stone-900/40 p-8">
				<p class="font-medium text-amber-300 text-sm tracking-[0.2em] uppercase">
					Upload and configure
				</p>
				<h2 class="mt-4 text-3xl font-semibold">Bring a PDF or image</h2>
				<p class="mt-3 max-w-2xl text-stone-400">
					Choose a source document now. Processing Configuration opens
					immediately; you only need to sign in when you start processing.
				</p>
				<div class="mt-8">
					<UploadPrompt state={props.creation} />
				</div>
			</section>

			<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
				<h2 class="text-2xl font-semibold">Private document library</h2>
				<p class="mt-3 text-stone-400">
					Sign in only when you are ready to create, process, read, and manage
					Documents.
				</p>
			</section>
		</div>
	);
}

export function SignedInDocuments(props: {
	readerName: string;
	documents: Array<DocumentListItem> | undefined;
	error: Error | undefined;
	creation: DocumentCreation;
}) {
	const [isAddingDocument, setIsAddingDocument] = createSignal(false);
	const [eventsDocumentId, setEventsDocumentId] = createSignal<
		Id<"documents"> | undefined
	>();
	const [deletingDocumentId, setDeletingDocumentId] = createSignal<
		Id<"documents"> | undefined
	>();
	const [deleteError, setDeleteError] = createSignal<string>();
	const documents = createStableItems(
		() => props.documents,
		(document) => document._id,
		sameDocumentListItem,
	);

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

			const response = await fetch(
				`/api/documents/${encodeURIComponent(document._id)}`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
			};

			if (!response.ok) {
				throw new Error(payload.error || "Could not delete Document");
			}
			if (eventsDocumentId() === document._id) {
				setEventsDocumentId(undefined);
			}
		} catch (error) {
			setDeleteError(
				error instanceof Error ? error.message : "Could not delete Document",
			);
		} finally {
			setDeletingDocumentId(undefined);
		}
	}

	return (
		<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
			<div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div>
					<p class="text-stone-400">Welcome, {props.readerName}</p>
					<h2 class="text-3xl font-semibold">Documents</h2>
				</div>
				<Show when={documents()?.length}>
					<button
						class="rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950 disabled:opacity-50"
						disabled={isAddingDocument()}
						type="button"
						onClick={() => setIsAddingDocument(true)}
					>
						{isAddingDocument() ? "Adding document" : "Add document"}
					</button>
				</Show>
			</div>

			<Show when={deleteError()}>
				{(message) => (
					<p class="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-red-300 text-sm">
						{message()}
					</p>
				)}
			</Show>

			<Show
				when={!props.error}
				fallback={<p class="mt-8 text-red-300">{props.error?.message}</p>}
			>
				<Show
					when={documents() !== undefined}
					fallback={
						<div class="mt-8 h-32 animate-pulse rounded-2xl bg-stone-800" />
					}
				>
					<Show
						when={documents()?.length}
						fallback={<EmptyLibrary creation={props.creation} />}
					>
						<div class="contents">
							<div class="mt-8 divide-y divide-stone-800 rounded-2xl border border-stone-800">
								<Index each={documents()}>
									{(document) => {
										const eventsOpen = () =>
											eventsDocumentId() === document()._id;

										return (
											<div class="p-4">
												<div class="flex items-center justify-between gap-4">
													<div>
														<Link
															class="font-medium hover:text-amber-200"
															params={{ documentId: document()._id }}
															to="/documents/$documentId"
														>
															{document().filename}
														</Link>
														<p class="text-stone-500 text-sm">
															Updated{" "}
															{new Date(document().updatedAt).toLocaleString()}
														</p>
													</div>
													<div class="flex items-center gap-2">
														<span class="rounded-full border border-stone-700 px-3 py-1 text-stone-400 text-xs">
															{document().processingStatus}
														</span>
														<button
															class="rounded-lg border border-stone-700 px-3 py-1 text-stone-300 text-xs hover:bg-stone-800"
															type="button"
															onClick={() =>
																setEventsDocumentId(
																	eventsOpen() ? undefined : document()._id,
																)
															}
														>
															{eventsOpen() ? "Hide events" : "Events"}
														</button>
														<Link
															class="rounded-lg border border-stone-700 px-3 py-1 text-stone-300 text-xs hover:bg-stone-800"
															params={{ documentId: document()._id }}
															to="/documents/$documentId"
														>
															Open
														</Link>
														<button
															class="rounded-lg border border-red-900/70 px-3 py-1 text-red-300 text-xs hover:bg-red-950/40 disabled:opacity-50"
															disabled={deletingDocumentId() !== undefined}
															type="button"
															onClick={() => void deleteDocument(document())}
														>
															{deletingDocumentId() === document()._id
																? "Deleting…"
																: "Delete"}
														</button>
													</div>
												</div>
												<Show when={eventsOpen()}>
													<ProcessingEventsPanel documentId={document()._id} />
												</Show>
											</div>
										);
									}}
								</Index>
							</div>
							<Show when={isAddingDocument()}>
								<div class="mt-8 rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-6">
									<div class="mb-5 flex items-center justify-between gap-4">
										<h3 class="font-semibold text-xl">Add Document</h3>
										<button
											class="rounded-lg border border-stone-700 px-3 py-1 text-stone-300 text-sm hover:bg-stone-800"
											type="button"
											onClick={() => setIsAddingDocument(false)}
										>
											Cancel
										</button>
									</div>
									<UploadPrompt state={props.creation} />
								</div>
							</Show>
						</div>
					</Show>
				</Show>
			</Show>
		</section>
	);
}

function sameDocumentListItem(
	previous: DocumentListItem,
	next: DocumentListItem,
) {
	return (
		previous._id === next._id &&
		previous.filename === next.filename &&
		previous.processingStatus === next.processingStatus &&
		previous.updatedAt === next.updatedAt
	);
}

function EmptyLibrary(props: { creation: DocumentCreation }) {
	return (
		<div class="mt-8 rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-10">
			<div class="text-center">
				<h3 class="text-xl font-semibold">No Documents yet</h3>
				<p class="mt-2 text-stone-500">
					Choose a PDF or image, confirm Processing Configuration, and create
					your first Document.
				</p>
			</div>
			<div class="mt-8">
				<UploadPrompt state={props.creation} />
			</div>
		</div>
	);
}
