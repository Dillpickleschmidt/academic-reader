import type { Doc } from "@academic-reader/convex/data-model";
import { Link } from "@tanstack/solid-router";
import Activity from "lucide-solid/icons/activity";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Bug from "lucide-solid/icons/bug";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Download from "lucide-solid/icons/download";
import FileText from "lucide-solid/icons/file-text";
import ListTree from "lucide-solid/icons/list-tree";
import X from "lucide-solid/icons/x";
import { createSignal, type JSX, Show } from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { TableOfContentsList } from "./DocumentTableOfContentsList";
import type { DocumentDownloadFormat } from "./document-download";

type DocumentSidebarProps = {
	blocks: Doc<"blocks">[] | undefined;
	canDownload: boolean;
	class?: string;
	debugEnabled: boolean;
	document: Doc<"documents"> | undefined;
	downloadError: string | undefined;
	downloadingFormat: DocumentDownloadFormat | undefined;
	entries: Doc<"tableOfContentsEntries">[] | undefined;
	expanded: boolean;
	pages: Doc<"pages">[] | undefined;
	onClose?: () => void;
	onDownload: (format: DocumentDownloadFormat) => void;
	onExpandedChange?: (expanded: boolean) => void;
	onOpenEvents: () => void;
	onShowReaderBlock: (block: Doc<"blocks">) => void;
	onToggleDebug: () => void;
};

export function DocumentSidebar(props: DocumentSidebarProps) {
	return (
		<Show
			when={props.onExpandedChange}
			fallback={
				<aside
					class={cn(
						"flex h-full min-h-0 w-72 flex-col border-border border-r bg-background text-foreground",
						props.class,
					)}
				>
					<SidebarPanel {...props} expanded />
				</aside>
			}
		>
			{(onExpandedChange) => {
				const setExpanded = onExpandedChange();

				function handleFocusOut(
					event: FocusEvent & { currentTarget: HTMLElement },
				) {
					const nextFocus = event.relatedTarget;
					if (
						nextFocus instanceof Node &&
						event.currentTarget.contains(nextFocus)
					) {
						return;
					}
					setExpanded(false);
				}

				return (
					<aside
						class={cn(
							"relative h-full min-h-0 w-12 shrink-0 text-foreground",
							props.class,
						)}
						on:focusin={() => setExpanded(true)}
						on:focusout={handleFocusOut}
						on:pointerenter={() => setExpanded(true)}
						on:pointerleave={() => setExpanded(false)}
					>
						<div
							class={cn(
								"absolute inset-y-0 left-0 z-20 flex w-72 min-w-0 flex-col overflow-hidden border-border border-r bg-background transition-[clip-path,box-shadow] duration-200 ease-out motion-reduce:transition-none",
								props.expanded && "shadow-overlay",
							)}
							style={{
								"clip-path": props.expanded
									? "inset(0 0 0 0)"
									: "inset(0 calc(100% - 3rem) 0 0)",
							}}
						>
							<SidebarPanel {...props} />
						</div>
					</aside>
				);
			}}
		</Show>
	);
}

function SidebarPanel(props: DocumentSidebarProps) {
	const downloadsDisabled = () =>
		!props.canDownload || props.downloadingFormat !== undefined;
	const [tableOfContentsOpen, setTableOfContentsOpen] = createSignal(true);
	const tableOfContentsExpanded = () => props.expanded && tableOfContentsOpen();

	return (
		<>
			<div
				class={cn(
					"flex items-start gap-2 overflow-hidden border-border border-b px-2 py-1",
					props.expanded ? "h-14" : "h-10",
				)}
			>
				<Tooltip placement="right">
					<TooltipTrigger
						as={Link}
						class={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							"mt-0.5",
						)}
						to="/"
					>
						<ArrowLeft class="size-4" />
						<span class="sr-only">Back to Library</span>
					</TooltipTrigger>
					<Show when={!props.expanded}>
						<TooltipContent>Back to Library</TooltipContent>
					</Show>
				</Tooltip>
				<div
					class={cn(
						"min-w-0 flex-1 overflow-hidden transition-[margin,opacity] duration-150",
						props.expanded ? "mt-2 opacity-100 delay-75" : "opacity-0",
					)}
				>
					<div class="font-semibold text-sm leading-4">Academic Reader</div>
					<div class="mt-1 truncate text-muted-foreground text-xs leading-4">
						{props.document?.filename ?? "Loading Document…"}
					</div>
				</div>
				<Show when={props.onClose}>
					{(onClose) => (
						<button
							class={cn(
								buttonVariants({ variant: "ghost", size: "icon" }),
								"lg:hidden",
							)}
							type="button"
							onClick={onClose()}
						>
							<X class="size-4" />
							<span class="sr-only">Close Sidebar</span>
						</button>
					)}
				</Show>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-2">
				<Collapsible
					open={tableOfContentsExpanded()}
					onOpenChange={setTableOfContentsOpen}
				>
					<CollapsibleTrigger
						class={cn(sidebarActionClass(), props.expanded ? "mt-1" : "mt-5")}
					>
						<ListTree class="size-4" />
						<span class={sidebarActionLabelClass(props.expanded)}>
							Table of Contents
						</span>
						<ChevronDown
							class={cn(
								"ml-auto size-4 text-muted-foreground transition-[opacity,transform]",
								props.expanded ? "opacity-100" : "opacity-0",
								tableOfContentsExpanded() && "rotate-180",
							)}
						/>
					</CollapsibleTrigger>
					<CollapsibleContent class="mt-2 pr-1">
						<div class="max-h-[min(50vh,32rem)] overflow-y-auto">
							<TableOfContentsList
								blocks={props.blocks}
								entries={props.entries}
								pages={props.pages}
								onNavigate={props.onClose}
								onShowReaderBlock={props.onShowReaderBlock}
							/>
						</div>
					</CollapsibleContent>
				</Collapsible>

				<section class="mt-4 grid gap-2">
					<h2 class={sectionLabelClass(props.expanded, true)}>Downloads</h2>
					<SidebarAction
						disabled={downloadsDisabled()}
						expanded={props.expanded}
						label={
							props.downloadingFormat === "markdown"
								? "Downloading Markdown…"
								: "Download Markdown"
						}
						onClick={() => props.onDownload("markdown")}
					>
						<FileText class="size-4" />
					</SidebarAction>
					<SidebarAction
						disabled={downloadsDisabled()}
						expanded={props.expanded}
						label={
							props.downloadingFormat === "html"
								? "Downloading HTML…"
								: "Download HTML"
						}
						onClick={() => props.onDownload("html")}
					>
						<Download class="size-4" />
					</SidebarAction>
					<Show when={props.expanded ? props.downloadError : undefined}>
						{(message) => (
							<p class="rounded-sm bg-destructive/10 p-3 text-destructive text-xs">
								{message()}
							</p>
						)}
					</Show>
				</section>
			</div>

			<div class="space-y-2 border-border border-t p-2">
				<h2 class={sectionLabelClass(props.expanded)}>Diagnostics</h2>
				<SidebarAction
					active={props.debugEnabled}
					expanded={props.expanded}
					label={props.debugEnabled ? "Hide Debug" : "Show Debug"}
					pressed={props.debugEnabled}
					onClick={props.onToggleDebug}
				>
					<Bug class="size-4" />
				</SidebarAction>
				<SidebarAction
					expanded={props.expanded}
					label="Processing Events"
					onClick={props.onOpenEvents}
				>
					<Activity class="size-4" />
				</SidebarAction>
			</div>
		</>
	);
}

function SidebarAction(props: {
	active?: boolean;
	children: JSX.Element;
	disabled?: boolean;
	expanded: boolean;
	label: string;
	pressed?: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip placement="right">
			<TooltipTrigger
				aria-pressed={props.pressed}
				class={sidebarActionClass(props.active)}
				disabled={props.disabled}
				type="button"
				onClick={() => props.onClick()}
			>
				{props.children}
				<span class={sidebarActionLabelClass(props.expanded)}>
					{props.label}
				</span>
			</TooltipTrigger>
			<Show when={!props.expanded}>
				<TooltipContent>{props.label}</TooltipContent>
			</Show>
		</Tooltip>
	);
}

function sidebarActionClass(active = false) {
	return cn(
		"flex h-8 w-full items-center justify-start gap-2 overflow-hidden whitespace-nowrap rounded-sm px-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
		active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
	);
}

function sidebarActionLabelClass(expanded: boolean) {
	return cn(
		"min-w-0 truncate transition-opacity duration-150",
		expanded ? "opacity-100 delay-75" : "opacity-0",
	);
}

function sectionLabelClass(expanded: boolean, reserveHeight = false) {
	return cn(
		"overflow-hidden px-2 font-medium text-muted-foreground text-xs transition-[height,opacity] duration-150",
		expanded
			? "h-5 opacity-100 delay-75"
			: reserveHeight
				? "h-5 opacity-0"
				: "h-0 opacity-0",
	);
}
