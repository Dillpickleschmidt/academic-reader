import type { Doc } from "@academic-reader/convex/data-model";
import { createMemo, For, Show } from "solid-js";
import { EmptyPane, PaneSkeleton } from "./document-page-ui";

export function TableOfContentsDrawer(props: {
	open: boolean;
	entries: Doc<"tableOfContentsEntries">[] | undefined;
	pages: Doc<"pages">[] | undefined;
	blocks: Doc<"blocks">[] | undefined;
	onClose: () => void;
	onShowReaderBlock: (block: Doc<"blocks">) => void;
}) {
	const loadedContent = createMemo(() => {
		if (
			props.entries === undefined ||
			props.pages === undefined ||
			props.blocks === undefined
		) {
			return undefined;
		}

		return {
			entries: props.entries,
			pages: props.pages,
			blocks: props.blocks,
		};
	});
	const blockByBlockId = createMemo(() => {
		const loaded = loadedContent();
		if (!loaded) return undefined;

		const blocks = new Map<string, Doc<"blocks">>();
		for (const block of loaded.blocks) blocks.set(block.blockId, block);
		return blocks;
	});
	const firstBlockByPhysicalPageNumber = createMemo(() => {
		const loaded = loadedContent();
		if (!loaded) return undefined;

		const blocks = new Map<number, Doc<"blocks">>();
		for (const block of loaded.blocks) {
			if (block.pageNumber === undefined || blocks.has(block.pageNumber))
				continue;
			blocks.set(block.pageNumber, block);
		}
		return blocks;
	});
	const pageLabelByPhysicalPageNumber = createMemo(() => {
		const loaded = loadedContent();
		if (!loaded) return undefined;

		const labels = new Map<number, string>();
		for (const page of loaded.pages) {
			if (page.pageLabel) labels.set(page.physicalPageNumber, page.pageLabel);
		}
		return labels;
	});

	function navigationBlockForEntry(entry: Doc<"tableOfContentsEntries">) {
		const target = entry.target;
		if (!target) return undefined;
		if (target.blockId) return blockByBlockId()?.get(target.blockId);
		return firstBlockByPhysicalPageNumber()?.get(target.physicalPageNumber);
	}

	function showEntry(entry: Doc<"tableOfContentsEntries">) {
		const block = navigationBlockForEntry(entry);
		if (!block) return;
		props.onShowReaderBlock(block);
		props.onClose();
	}

	return (
		<aside
			class={`fixed inset-y-0 left-0 z-40 w-full max-w-md border-stone-800 border-r bg-stone-950 p-4 shadow-2xl shadow-black/50 transition-transform duration-200 ${
				props.open ? "translate-x-0" : "-translate-x-full"
			}`}
		>
			<div class="flex items-center justify-between gap-4">
				<h2 class="font-semibold text-lg">Table of Contents</h2>
				<button
					class="rounded-full border border-stone-700 px-3 py-1 text-stone-300 text-sm hover:bg-stone-900"
					type="button"
					onClick={props.onClose}
				>
					Close
				</button>
			</div>
			<div class="mt-4 h-[calc(100%-4rem)] overflow-y-auto">
				<Show when={loadedContent()} fallback={<PaneSkeleton />}>
					{(loaded) => (
						<Show
							when={loaded().entries.length > 0}
							fallback={
								<EmptyPane
									title="No Table of Contents"
									body="This Source Document did not provide outline entries."
								/>
							}
						>
							<div class="space-y-1">
								<For each={loaded().entries}>
									{(entry) => {
										const navigationBlock = () =>
											navigationBlockForEntry(entry);
										const isEnabled = () => navigationBlock() !== undefined;
										const pageLabel = () =>
											entry.target
												? pageLabelByPhysicalPageNumber()?.get(
														entry.target.physicalPageNumber,
													)
												: undefined;

										return (
											<button
												class={tableOfContentsEntryClass(isEnabled())}
												disabled={!isEnabled()}
												style={{
													"padding-left": `${0.75 + entry.depth * 0.75}rem`,
												}}
												type="button"
												onClick={() => showEntry(entry)}
											>
												<span class="block truncate text-left">
													{entry.title}
												</span>
												<span class="mt-0.5 block text-left text-[11px] text-stone-500">
													{tableOfContentsEntrySubtitle(
														entry.target,
														pageLabel(),
														isEnabled(),
													)}
												</span>
											</button>
										);
									}}
								</For>
							</div>
						</Show>
					)}
				</Show>
			</div>
		</aside>
	);
}

function tableOfContentsEntryClass(isEnabled: boolean) {
	return isEnabled
		? "block w-full rounded-xl py-2 pr-3 text-sm text-stone-200 hover:bg-stone-900"
		: "block w-full cursor-default rounded-xl py-2 pr-3 text-sm text-stone-600";
}

function tableOfContentsEntrySubtitle(
	target: Doc<"tableOfContentsEntries">["target"],
	pageLabel: string | undefined,
	isEnabled: boolean,
) {
	if (!target) return "No target";
	const pageText = tableOfContentsPageText(target, pageLabel);
	return isEnabled ? pageText : `${pageText} · not processed`;
}

function tableOfContentsPageText(
	target: NonNullable<Doc<"tableOfContentsEntries">["target"]>,
	pageLabel: string | undefined,
) {
	if (pageLabel && pageLabel !== String(target.physicalPageNumber)) {
		return `${pageLabel} · p${target.physicalPageNumber}`;
	}
	return `Page ${target.physicalPageNumber}`;
}
