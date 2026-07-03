import type { Doc } from "@academic-reader/convex/data-model";
import { createMemo, Index, Show } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import { createStableItems } from "./document-stable-list";

export function TableOfContentsList(props: {
	entries: Doc<"tableOfContentsEntries">[] | undefined;
	pages: Doc<"pages">[] | undefined;
	blocks: Doc<"blocks">[] | undefined;
	onNavigate?: () => void;
	onShowReaderBlock: (block: Doc<"blocks">) => void;
}) {
	const entries = createStableItems(
		() => props.entries,
		(entry) => entry._id,
		sameTableOfContentsEntry,
	);
	const loadedContent = createMemo(() => {
		const stableEntries = entries();
		if (
			stableEntries === undefined ||
			props.pages === undefined ||
			props.blocks === undefined
		) {
			return undefined;
		}

		return {
			entries: stableEntries,
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
		props.onNavigate?.();
	}

	return (
		<Show when={loadedContent()} fallback={<TableOfContentsLoading />}>
			{(loaded) => (
				<Show
					when={loaded().entries.length > 0}
					fallback={<TableOfContentsEmpty />}
				>
					<div class="space-y-1">
						<Index each={loaded().entries}>
							{(entry) => {
								const navigationBlock = () => navigationBlockForEntry(entry());
								const isEnabled = () => navigationBlock() !== undefined;
								const pageLabel = () => {
									const target = entry().target;
									return target
										? pageLabelByPhysicalPageNumber()?.get(
												target.physicalPageNumber,
											)
										: undefined;
								};

								return (
									<button
										class={tableOfContentsEntryClass(isEnabled())}
										disabled={!isEnabled()}
										style={{
											"padding-left": `${0.75 + entry().depth * 0.75}rem`,
										}}
										type="button"
										onClick={() => showEntry(entry())}
									>
										<span class="block truncate text-left">
											{entry().title}
										</span>
										<span class="mt-0.5 block text-left text-[11px] text-muted-foreground">
											{tableOfContentsEntrySubtitle(
												entry().target,
												pageLabel(),
												isEnabled(),
											)}
										</span>
									</button>
								);
							}}
						</Index>
					</div>
				</Show>
			)}
		</Show>
	);
}

function TableOfContentsLoading() {
	return (
		<div class="space-y-1">
			{[
				{ class: "pl-3", titleWidth: "w-3/4" },
				{ class: "pl-6 opacity-75", titleWidth: "w-1/2" },
				{ class: "pl-6 opacity-50", titleWidth: "w-3/5" },
			].map((row) => (
				<div class={`py-2 pr-3 ${row.class}`}>
					<div class="flex h-5 items-center">
						<Skeleton class={`h-3 ${row.titleWidth}`} />
					</div>
					<div class="mt-0.5 flex h-5 items-center">
						<Skeleton class="h-2.5 w-14" />
					</div>
				</div>
			))}
		</div>
	);
}

function TableOfContentsEmpty() {
	return (
		<div class="rounded-sm border border-border bg-card p-4 text-sm">
			<div class="font-medium text-foreground">No Table of Contents</div>
			<p class="mt-1 text-muted-foreground">
				This Source Document did not provide outline entries.
			</p>
		</div>
	);
}

function sameTableOfContentsEntry(
	previous: Doc<"tableOfContentsEntries">,
	next: Doc<"tableOfContentsEntries">,
) {
	return (
		previous._id === next._id &&
		previous._creationTime === next._creationTime &&
		previous.documentId === next.documentId &&
		previous.order === next.order &&
		previous.depth === next.depth &&
		previous.title === next.title &&
		sameTableOfContentsTarget(previous.target, next.target)
	);
}

function sameTableOfContentsTarget(
	previous: Doc<"tableOfContentsEntries">["target"],
	next: Doc<"tableOfContentsEntries">["target"],
) {
	if (previous === next) return true;
	if (!previous || !next) return false;
	return (
		previous.physicalPageNumber === next.physicalPageNumber &&
		previous.blockId === next.blockId &&
		previous.sourcePoint?.left === next.sourcePoint?.left &&
		previous.sourcePoint?.top === next.sourcePoint?.top
	);
}

function tableOfContentsEntryClass(isEnabled: boolean) {
	return isEnabled
		? "block w-full rounded-sm py-2 pr-3 text-foreground text-sm transition-colors hover:bg-muted"
		: "block w-full cursor-default rounded-sm py-2 pr-3 text-dim text-sm";
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
