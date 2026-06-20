import { api } from "@academic-reader/convex/api";
import type { Id } from "@academic-reader/convex/data-model";
import {
	type PhaseStatus,
	PROCESSING_PHASES,
	type ProcessingPhaseId,
	type ProcessingPhaseSummary,
	readerViewReady,
} from "@academic-reader/shared/processing-phases";
import { useQuery } from "convex-solidjs";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useConvexAuth } from "../../providers/convex";
import { ProcessingEventsList } from "./ProcessingEventsList";

export function DocumentProcessing(props: {
	documentId: Id<"documents">;
	processingStatus: string;
	narrationEnabled: boolean;
	bare?: boolean;
}) {
	const convexAuth = useConvexAuth();
	const summary = useQuery(
		api.api.processingEvents.getProgressSummaryForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);
	const phaseMap = createMemo(
		() => new Map(summary.data()?.phases.map((phase) => [phase.id, phase])),
	);
	const visiblePhaseDefinitions = createMemo(() =>
		PROCESSING_PHASES.filter(
			(phase) => !phase.narration || props.narrationEnabled,
		),
	);
	const visiblePhases = createMemo(() => {
		const map = phaseMap();
		const phases: ProcessingPhaseSummary[] = [];
		for (const definition of visiblePhaseDefinitions()) {
			const phase = map.get(definition.id);
			if (phase) phases.push(phase);
		}
		return phases;
	});

	const [picked, setPicked] = createSignal<ProcessingPhaseId>();
	const selected = createMemo<ProcessingPhaseSummary | undefined>(() => {
		const list = visiblePhases();
		const id = picked();
		if (id) {
			const pickedPhase = list.find((phase) => phase.id === id);
			if (pickedPhase) return pickedPhase;
		}
		return (
			list.find((phase) => phase.status === "active") ??
			list.find((phase) => phase.status === "failed") ??
			list[0]
		);
	});

	return (
		<div
			class={
				props.bare
					? "mt-3"
					: "mt-4 rounded-xl border border-border bg-background p-4"
			}
		>
			<Show when={summary.error()}>
				{(error) => <p class="text-destructive text-sm">{error().message}</p>}
			</Show>

			<Show
				when={summary.data()}
				fallback={<div class="h-10 animate-pulse rounded-lg bg-muted" />}
			>
				{(progressSummary) => (
					<>
						<div class="flex flex-wrap items-center gap-x-1 gap-y-2">
							<For each={visiblePhaseDefinitions()}>
								{(definition, index) => {
									const phase = () => phaseMap().get(definition.id);
									return (
										<Show when={phase()}>
											{(phase) => (
												<>
													<Show when={phase().narration && index() > 0}>
														<span class="px-0.5 text-dim text-xs">→</span>
													</Show>
													<PhaseButton
														phase={phase()}
														selected={selected()?.id === phase().id}
														onSelect={() => setPicked(phase().id)}
													/>
													<Show when={phase().id === "conversion"}>
														<ReadableMarker
															ready={readerViewReady(props.processingStatus)}
														/>
													</Show>
												</>
											)}
										</Show>
									);
								}}
							</For>
						</div>

						<Show when={selected()}>
							{(phase) => <PhaseDetail phase={phase()} />}
						</Show>

						<ProcessingEventsDetails
							documentId={props.documentId}
							eventCount={progressSummary().eventCount}
						/>
					</>
				)}
			</Show>
		</div>
	);
}

function ProcessingEventsDetails(props: {
	documentId: Id<"documents">;
	eventCount: number;
}) {
	const [open, setOpen] = createSignal(false);

	return (
		<details
			class="mt-4"
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary class="cursor-pointer text-dim text-xs hover:text-muted-foreground">
				All Processing Events ({props.eventCount})
			</summary>
			<Show when={open()}>
				<ProcessingEventsQuery documentId={props.documentId} />
			</Show>
		</details>
	);
}

function ProcessingEventsQuery(props: { documentId: Id<"documents"> }) {
	const convexAuth = useConvexAuth();
	const events = useQuery(
		api.api.processingEvents.listForDocument,
		() => ({ documentId: props.documentId }),
		() => ({
			enabled: convexAuth.isAuthenticated(),
			keepPreviousData: true,
		}),
	);

	return (
		<>
			<Show when={events.error()}>
				{(error) => (
					<p class="mt-3 text-destructive text-sm">{error().message}</p>
				)}
			</Show>
			<ProcessingEventsList events={events.data()} />
		</>
	);
}

function PhaseButton(props: {
	phase: ProcessingPhaseSummary;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={props.onSelect}
			class="rounded px-1.5 py-0.5 text-sm"
			classList={{
				"font-semibold": props.selected,
				"text-foreground underline decoration-foreground/40 underline-offset-4":
					props.phase.status === "active",
				"text-muted-foreground": props.phase.status === "done",
				"text-dim": props.phase.status === "pending",
				"text-primary": props.phase.status === "warning",
				"text-destructive": props.phase.status === "failed",
			}}
		>
			<span class="mr-1 font-mono text-xs">
				{statusGlyph(props.phase.status)}
			</span>
			{props.phase.name}
		</button>
	);
}

function ReadableMarker(props: { ready: boolean }) {
	return (
		<span
			class="ml-1 inline-flex items-center gap-1.5 px-1.5 text-xs"
			classList={{ "text-primary": props.ready, "text-dim": !props.ready }}
			title="The Reader View becomes available here; narration continues in the background."
		>
			<span
				class="size-1.5 rounded-full"
				classList={{ "bg-primary": props.ready, "bg-dim": !props.ready }}
			/>
			Reader View ready
		</span>
	);
}

function PhaseDetail(props: { phase: ProcessingPhaseSummary }) {
	const phase = () => props.phase;
	const latestEvent = () => phase().latestEvent;
	return (
		<div class="mt-4 border-border border-t pt-3">
			<div class="flex items-baseline justify-between gap-3">
				<span class="font-medium text-foreground text-sm">{phase().name}</span>
				<span class="text-dim text-xs">{statusLabel(phase().status)}</span>
			</div>

			<Show when={phase().status === "active" || phase().progress}>
				<ProgressBar phase={phase()} />
			</Show>

			<Show
				when={latestEvent()}
				fallback={
					<p class="mt-3 text-muted-foreground text-sm">Not started yet.</p>
				}
			>
				{(event) => (
					<p
						class="mt-3 text-sm"
						classList={{
							"text-destructive": event().severity === "error",
							"text-primary": event().severity === "warning",
							"text-muted-foreground": event().severity === "info",
						}}
					>
						{event().message}
					</p>
				)}
			</Show>
		</div>
	);
}

function ProgressBar(props: { phase: ProcessingPhaseSummary }) {
	const percent = () => progressPercent(props.phase);
	return (
		<div class="mt-3">
			<div class="flex items-center justify-between text-dim text-xs">
				<span>{props.phase.progress?.label ?? ""}</span>
				<span class="font-mono">{progressLabel(props.phase)}</span>
			</div>
			<div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
				<Show
					when={!props.phase.indeterminate}
					fallback={
						<div class="h-full w-1/3 animate-pulse rounded-full bg-muted-foreground" />
					}
				>
					<div
						class="h-full rounded-full bg-primary transition-[width] duration-500"
						style={{ width: `${percent()}%` }}
					/>
				</Show>
			</div>
		</div>
	);
}

function statusGlyph(status: PhaseStatus): string {
	if (status === "done") return "✓";
	if (status === "failed") return "✕";
	if (status === "warning") return "!";
	if (status === "active") return "▸";
	return "·";
}

function statusLabel(status: PhaseStatus): string {
	if (status === "done") return "complete";
	if (status === "failed") return "failed";
	if (status === "warning") return "completed with warnings";
	if (status === "active") return "in progress";
	return "not started";
}

function progressPercent(phase: ProcessingPhaseSummary): number {
	const progress = phase.progress;
	if (!progress)
		return phase.status === "done" || phase.status === "warning" ? 100 : 0;
	if (progress.percent !== undefined) return Math.round(progress.percent);
	if (progress.current !== undefined && progress.total) {
		return Math.round((progress.current / progress.total) * 100);
	}
	return phase.status === "done" || phase.status === "warning" ? 100 : 0;
}

function progressLabel(phase: ProcessingPhaseSummary): string {
	const progress = phase.progress;
	if (progress?.current !== undefined && progress?.total !== undefined) {
		return `${progress.current} / ${progress.total}`;
	}
	if (phase.indeterminate) return "working…";
	return `${progressPercent(phase)}%`;
}
