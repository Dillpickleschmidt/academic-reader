import { api } from "@academic-reader/convex/api";
import type { Id } from "@academic-reader/convex/data-model";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import { useQuery } from "convex-solidjs";
import { createMemo, For, Show } from "solid-js";
import { useConvexAuth } from "../../providers/convex";

interface ProcessingEvent extends ProcessingEventInput {
	_id: string;
	_creationTime: number;
	documentId: string;
}

export function ProcessingEventsPanel(props: { documentId: Id<"documents"> }) {
	const convexAuth = useConvexAuth();
	const persistedEvents = useQuery(
		api.api.processingEvents.listForDocument,
		() => ({ documentId: props.documentId }),
		() => ({ enabled: convexAuth.isAuthenticated() }),
	);
	const events = createMemo(() => {
		const persisted = persistedEvents.data();
		if (persisted === undefined) return undefined;
		return [...persisted].sort((a, b) => a._creationTime - b._creationTime);
	});

	return (
		<div class="mt-4 rounded-xl border border-stone-800 bg-stone-950 p-4">
			<div class="flex items-center justify-between gap-4">
				<h3 class="font-medium text-sm text-stone-200">Processing Events</h3>
			</div>

			<Show when={persistedEvents.error()}>
				{(error) => <p class="mt-3 text-red-300 text-sm">{error().message}</p>}
			</Show>

			<Show
				when={events() !== undefined}
				fallback={
					<div class="mt-4 h-16 animate-pulse rounded-lg bg-stone-800" />
				}
			>
				<Show
					when={events()?.length}
					fallback={
						<p class="mt-3 text-sm text-stone-500">No events recorded yet.</p>
					}
				>
					<ol class="mt-4 space-y-3">
						<For each={events()}>
							{(event) => <ProcessingEventItem event={event} />}
						</For>
					</ol>
				</Show>
			</Show>
		</div>
	);
}

function ProcessingEventItem(props: { event: ProcessingEvent }) {
	return (
		<li class="rounded-lg border border-stone-800 bg-stone-900/60 p-3 text-sm">
			<div class="flex flex-wrap items-center gap-2">
				<span class={severityClass(props.event.severity)}>
					{props.event.severity}
				</span>
				<span class="text-stone-500">{props.event.emitter}</span>
				<span class="text-stone-600">·</span>
				<span class="text-stone-400">{props.event.type}</span>
			</div>
			<p class="mt-2 text-stone-200">{props.event.message}</p>
			<Show when={props.event.progress}>
				{(progress) => (
					<p class="mt-2 text-stone-500 text-xs">
						{progress().label ? `${progress().label} · ` : ""}
						{progressText(progress())}
					</p>
				)}
			</Show>
			<p class="mt-2 text-stone-600 text-xs">
				Stored {new Date(props.event._creationTime).toLocaleTimeString()} ·
				emitted {new Date(props.event.emittedAt).toLocaleTimeString()}
			</p>
		</li>
	);
}

function progressText(progress: NonNullable<ProcessingEvent["progress"]>) {
	if (progress.percent !== undefined) {
		return `${Math.round(progress.percent)}%`;
	}
	if (progress.current !== undefined && progress.total !== undefined) {
		return `${progress.current}/${progress.total}`;
	}
	return "Progress recorded";
}

function severityClass(severity: string) {
	if (severity === "error") {
		return "rounded-full border border-red-500/40 px-2 py-0.5 text-red-300 text-xs";
	}
	if (severity === "warning") {
		return "rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-200 text-xs";
	}
	return "rounded-full border border-stone-700 px-2 py-0.5 text-stone-300 text-xs";
}
