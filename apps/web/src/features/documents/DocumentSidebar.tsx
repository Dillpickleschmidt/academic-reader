import type { Doc } from "@academic-reader/convex/data-model";
import { Link } from "@tanstack/solid-router";
import Activity from "lucide-solid/icons/activity";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Bug from "lucide-solid/icons/bug";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Download from "lucide-solid/icons/download";
import FileText from "lucide-solid/icons/file-text";
import X from "lucide-solid/icons/x";
import { Show } from "solid-js";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { TableOfContentsList } from "./DocumentTableOfContentsList";
import type { DocumentDownloadFormat } from "./document-download";

export function DocumentSidebar(props: {
	blocks: Doc<"blocks">[] | undefined;
	canDownload: boolean;
	class?: string;
	debugEnabled: boolean;
	document: Doc<"documents"> | undefined;
	downloadError: string | undefined;
	downloadingFormat: DocumentDownloadFormat | undefined;
	entries: Doc<"tableOfContentsEntries">[] | undefined;
	pages: Doc<"pages">[] | undefined;
	onClose?: () => void;
	onDownload: (format: DocumentDownloadFormat) => void;
	onOpenEvents: () => void;
	onShowReaderBlock: (block: Doc<"blocks">) => void;
	onToggleDebug: () => void;
}) {
	return (
		<aside
			class={cn(
				"flex h-full min-h-0 w-72 shrink-0 flex-col border-border border-r bg-background/95 text-foreground",
				props.class,
			)}
		>
			<div class="flex items-start gap-2 border-border border-b p-4">
				<Link
					class="mt-0.5 rounded-full border border-border p-2 text-muted-foreground hover:bg-card hover:text-foreground"
					to="/"
				>
					<ArrowLeft class="size-4" />
					<span class="sr-only">Back to Library</span>
				</Link>
				<div class="min-w-0 flex-1">
					<div class="font-semibold text-sm">Academic Reader</div>
					<div class="mt-1 truncate text-muted-foreground text-xs">
						{props.document?.filename ?? "Loading Document…"}
					</div>
				</div>
				<Show when={props.onClose}>
					{(onClose) => (
						<button
							class="rounded-full border border-border p-2 text-muted-foreground hover:bg-card hover:text-foreground lg:hidden"
							type="button"
							onClick={onClose()}
						>
							<X class="size-4" />
							<span class="sr-only">Close Sidebar</span>
						</button>
					)}
				</Show>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-3">
				<section class="space-y-2">
					<h2 class="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Downloads
					</h2>
					<button
						class={sidebarActionClass()}
						disabled={
							!props.canDownload || props.downloadingFormat !== undefined
						}
						type="button"
						onClick={() => props.onDownload("markdown")}
					>
						<FileText class="size-4" />
						<span>
							{props.downloadingFormat === "markdown"
								? "Downloading Markdown…"
								: "Download Markdown"}
						</span>
					</button>
					<button
						class={sidebarActionClass()}
						disabled={
							!props.canDownload || props.downloadingFormat !== undefined
						}
						type="button"
						onClick={() => props.onDownload("html")}
					>
						<Download class="size-4" />
						<span>
							{props.downloadingFormat === "html"
								? "Downloading HTML…"
								: "Download HTML"}
						</span>
					</button>
					<Show when={props.downloadError}>
						{(message) => (
							<p class="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive text-xs">
								{message()}
							</p>
						)}
					</Show>
				</section>

				<Collapsible class="mt-6" defaultOpen>
					<CollapsibleTrigger class="group flex w-full items-center justify-between rounded-xl px-2 py-2 font-medium text-sm hover:bg-card">
						<span>Table of Contents</span>
						<ChevronDown class="size-4 text-muted-foreground transition-transform group-data-[expanded]:rotate-180" />
					</CollapsibleTrigger>
					<CollapsibleContent class="mt-2 max-h-[min(50vh,32rem)] overflow-y-auto pr-1">
						<TableOfContentsList
							blocks={props.blocks}
							entries={props.entries}
							pages={props.pages}
							onNavigate={props.onClose}
							onShowReaderBlock={props.onShowReaderBlock}
						/>
					</CollapsibleContent>
				</Collapsible>
			</div>

			<div class="space-y-2 border-border border-t p-3">
				<h2 class="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Diagnostics
				</h2>
				<button
					aria-pressed={props.debugEnabled}
					class={sidebarActionClass(props.debugEnabled)}
					type="button"
					onClick={props.onToggleDebug}
				>
					<Bug class="size-4" />
					<span>{props.debugEnabled ? "Hide Debug" : "Show Debug"}</span>
				</button>
				<button
					class={sidebarActionClass()}
					type="button"
					onClick={props.onOpenEvents}
				>
					<Activity class="size-4" />
					<span>Processing Events</span>
				</button>
			</div>
		</aside>
	);
}

function sidebarActionClass(active = false) {
	return cn(
		"flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
		active
			? "border border-primary/40 bg-primary/10 text-primary"
			: "text-foreground hover:bg-card",
	);
}
