import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import { type Accessor, Index, Show } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import { createStableItems } from "./document-stable-list";

export interface ProcessingEvent extends ProcessingEventInput {
	_id: string;
	_creationTime: number;
	documentId: string;
}

export function ProcessingEventsList(props: {
	events: ProcessingEvent[] | undefined;
}) {
	const events = createStableItems(
		() => props.events,
		(event) => event._id,
		(previous, next) => previous._id === next._id,
	);

	return (
		<Show when={events()} fallback={<ProcessingEventsLoading />}>
			{(events) => (
				<Show
					when={events().length > 0}
					fallback={
						<p class="mt-3 text-muted-foreground text-sm">
							No events recorded yet.
						</p>
					}
				>
					<ol class="mt-2 divide-y divide-border">
						<Index each={events()}>
							{(event) => <ProcessingEventItem event={event} />}
						</Index>
					</ol>
				</Show>
			)}
		</Show>
	);
}

function ProcessingEventsLoading() {
	return (
		<div class="mt-2 divide-y divide-border">
			{["w-3/4", "w-1/2"].map((messageWidth) => (
				<div class="flex gap-3 py-3">
					<Skeleton class="mt-1.5 size-1.5 shrink-0 rounded-full" />
					<div class="min-w-0 flex-1">
						<div class="flex h-5 items-center">
							<Skeleton class={`h-3 ${messageWidth}`} />
						</div>
						<div class="mt-1 flex h-4 items-center">
							<Skeleton class="h-2.5 w-44" />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function ProcessingEventItem(props: { event: Accessor<ProcessingEvent> }) {
	const event = () => props.event();

	return (
		<li class="flex gap-3 py-3 text-sm">
			<span
				class="mt-1.5 size-1.5 shrink-0 rounded-full"
				classList={{
					"bg-destructive": event().severity === "error",
					"bg-warning": event().severity === "warning",
					"bg-dim": event().severity === "info",
				}}
				title={event().severity}
			/>
			<div class="min-w-0 flex-1">
				<p class="text-foreground">{event().message}</p>
				<Show when={event().progress}>
					{(progress) => (
						<p class="mt-1 text-muted-foreground text-xs">
							{progress().label ? `${progress().label} · ` : ""}
							{progressText(progress())}
						</p>
					)}
				</Show>
				<p class="mt-1 text-dim text-xs">
					{event().emitter} · {event().type} ·{" "}
					<span class="tabular-nums">
						{new Date(event().emittedAt).toLocaleTimeString()}
					</span>
				</p>
			</div>
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
