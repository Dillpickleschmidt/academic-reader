import type { Id } from "@academic-reader/convex/data-model";
import { Link } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { ProcessingEventsPanel } from "./ProcessingEventsPanel";
import { UploadPrompt } from "./SourceDocumentCreationFlow";
import type { SourceDocumentCreation } from "./source-document-creation";

export type SourceDocumentListItem = {
	_id: Id<"sourceDocuments">;
	filename: string;
	processingStatus: string;
	updatedAt: number;
};

export function SignedOutWorkbench(props: {
	creation: SourceDocumentCreation;
}) {
	return (
		<div class="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
			<section class="rounded-3xl border border-dashed border-stone-700 bg-stone-900/40 p-8">
				<p class="font-medium text-amber-300 text-sm tracking-[0.2em] uppercase">
					Upload and configure
				</p>
				<h2 class="mt-4 text-3xl font-semibold">Bring a source document</h2>
				<p class="mt-3 max-w-2xl text-stone-400">
					Choose a PDF or image now. Processing Configuration opens immediately;
					you only need to sign in when you start processing.
				</p>
				<div class="mt-8">
					<UploadPrompt state={props.creation} />
				</div>
			</section>

			<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
				<h2 class="text-2xl font-semibold">Authenticated workbench</h2>
				<p class="mt-3 text-stone-400">
					Sign in only when you are ready to create, process, read, and manage
					Source Documents.
				</p>
			</section>
		</div>
	);
}

export function SignedInWorkbench(props: {
	readerName: string;
	documents: Array<SourceDocumentListItem> | undefined;
	error: Error | undefined;
	creation: SourceDocumentCreation;
}) {
	const [isAddingSourceDocument, setIsAddingSourceDocument] =
		createSignal(false);

	return (
		<section class="rounded-3xl border border-stone-800 bg-stone-900/50 p-8">
			<div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div>
					<p class="text-stone-400">Welcome, {props.readerName}</p>
					<h2 class="text-3xl font-semibold">Source Documents</h2>
				</div>
				<Show when={props.documents && props.documents.length > 0}>
					<button
						class="rounded-lg bg-amber-300 px-4 py-2 font-medium text-stone-950 disabled:opacity-50"
						disabled={isAddingSourceDocument()}
						type="button"
						onClick={() => setIsAddingSourceDocument(true)}
					>
						{isAddingSourceDocument()
							? "Adding source document"
							: "Add source document"}
					</button>
				</Show>
			</div>

			<Show
				when={!props.error}
				fallback={<p class="mt-8 text-red-300">{props.error?.message}</p>}
			>
				<Show
					when={props.documents !== undefined}
					fallback={
						<div class="mt-8 h-32 animate-pulse rounded-2xl bg-stone-800" />
					}
				>
					<Show
						when={props.documents && props.documents.length > 0}
						fallback={<EmptyLibrary creation={props.creation} />}
					>
						<div class="contents">
							<div class="mt-8 divide-y divide-stone-800 rounded-2xl border border-stone-800">
								<For each={props.documents}>
									{(document) => (
										<div class="p-4">
											<div class="flex items-center justify-between gap-4">
												<div>
													<Link
														class="font-medium hover:text-amber-200"
														params={{ sourceDocumentId: document._id }}
														to="/documents/$sourceDocumentId"
													>
														{document.filename}
													</Link>
													<p class="text-stone-500 text-sm">
														Updated{" "}
														{new Date(document.updatedAt).toLocaleString()}
													</p>
												</div>
												<div class="flex items-center gap-2">
													<span class="rounded-full border border-stone-700 px-3 py-1 text-stone-400 text-xs">
														{document.processingStatus}
													</span>
													<Link
														class="rounded-lg border border-stone-700 px-3 py-1 text-stone-300 text-xs hover:bg-stone-800"
														params={{ sourceDocumentId: document._id }}
														to="/documents/$sourceDocumentId"
													>
														Open
													</Link>
												</div>
											</div>
											<ProcessingEventsPanel
												sourceDocumentId={document._id}
												isLive={document.processingStatus === "processing"}
											/>
										</div>
									)}
								</For>
							</div>
							<Show when={isAddingSourceDocument()}>
								<div class="mt-8 rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-6">
									<div class="mb-5 flex items-center justify-between gap-4">
										<h3 class="font-semibold text-xl">Add Source Document</h3>
										<button
											class="rounded-lg border border-stone-700 px-3 py-1 text-stone-300 text-sm hover:bg-stone-800"
											type="button"
											onClick={() => setIsAddingSourceDocument(false)}
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

function EmptyLibrary(props: { creation: SourceDocumentCreation }) {
	return (
		<div class="mt-8 rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-10">
			<div class="text-center">
				<h3 class="text-xl font-semibold">No Source Documents yet</h3>
				<p class="mt-2 text-stone-500">
					Choose a PDF or image, confirm Processing Configuration, and create
					your first Source Document.
				</p>
			</div>
			<div class="mt-8">
				<UploadPrompt state={props.creation} />
			</div>
		</div>
	);
}
