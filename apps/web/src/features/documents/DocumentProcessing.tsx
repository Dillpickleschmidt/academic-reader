import { api } from "@academic-reader/convex/api";
import type { Id } from "@academic-reader/convex/data-model";
import {
	type PhaseStatus,
	PROCESSING_PHASES,
	type ProcessingPhaseId,
	type ProcessingPhaseSummary,
	readerViewReady,
} from "@academic-reader/shared/processing-phases";
import Check from "lucide-solid/icons/check";
import CircleAlert from "lucide-solid/icons/circle-alert";
import Dot from "lucide-solid/icons/dot";
import X from "lucide-solid/icons/x";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { useQuery } from "../../lib/convex-query";
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

	const readingDefinitions = createMemo(() =>
		visiblePhaseDefinitions().filter((definition) => !definition.narration),
	);
	const narrationDefinitions = createMemo(() =>
		visiblePhaseDefinitions().filter((definition) => definition.narration),
	);
	const narrationReady = createMemo(() => {
		const last = narrationDefinitions().at(-1);
		const status = last ? phaseMap().get(last.id)?.status : undefined;
		return status === "done" || status === "warning";
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
					: "mt-4 rounded-md border border-border bg-background p-4"
			}
		>
			<Show when={summary.error()}>
				{(error) => <p class="text-destructive text-sm">{error().message}</p>}
			</Show>

			<Show
				when={summary.data()}
				fallback={
					<ProcessingSkeleton narrationEnabled={props.narrationEnabled} />
				}
			>
				{(progressSummary) => (
					<>
						<div class="flex flex-col gap-y-2">
							<PhaseTrack
								definitions={readingDefinitions()}
								label={props.narrationEnabled ? "Reading" : undefined}
								milestoneLabel="Reader View ready"
								milestoneReady={readerViewReady(props.processingStatus)}
								milestoneTitle="The Reader View opens as soon as conversion finishes."
								phaseMap={phaseMap()}
								selectedId={selected()?.id}
								onSelect={setPicked}
							/>
							<Show when={props.narrationEnabled}>
								<PhaseTrack
									definitions={narrationDefinitions()}
									label="Narration"
									milestoneLabel="Narration ready"
									milestoneReady={narrationReady()}
									milestoneTitle="Narration plays in the Reader View once audio finishes; reading works before then."
									phaseMap={phaseMap()}
									selectedId={selected()?.id}
									onSelect={setPicked}
								/>
							</Show>
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

function ProcessingSkeleton(props: { narrationEnabled: boolean }) {
	return (
		<>
			<div class="flex flex-col gap-y-2">
				<ProcessingTrackSkeleton labeled={props.narrationEnabled} />
				<Show when={props.narrationEnabled}>
					<ProcessingTrackSkeleton labeled />
				</Show>
			</div>
			<div class="mt-4 border-border border-t pt-3">
				<div class="flex items-baseline justify-between gap-3">
					<div class="flex h-5 items-center">
						<Skeleton class="h-3 w-28" />
					</div>
					<div class="flex h-4 items-center">
						<Skeleton class="h-2.5 w-16" />
					</div>
				</div>
				<div class="mt-3 flex h-5 items-center">
					<Skeleton class="h-3 w-3/5" />
				</div>
			</div>
			<div class="mt-4 flex h-4 items-center">
				<Skeleton class="h-2.5 w-40" />
			</div>
		</>
	);
}

function ProcessingTrackSkeleton(props: { labeled: boolean }) {
	return (
		<div class="flex items-start gap-1">
			<Show when={props.labeled}>
				<div class="flex h-6 w-20 shrink-0 items-center">
					<Skeleton class="h-2.5 w-12" />
				</div>
			</Show>
			<div class="flex h-6 min-w-0 flex-1 items-center gap-2">
				<Skeleton class="h-3.5 w-16" />
				<Skeleton class="h-3.5 w-20" />
				<Skeleton class="h-3.5 w-14" />
				<Skeleton class="h-3.5 w-28" />
			</div>
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
	name: string;
	phase: ProcessingPhaseSummary;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={props.onSelect}
			class="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-sm transition-colors"
			classList={{
				"bg-muted": props.selected,
				"font-medium text-foreground": props.phase.status === "active",
				"text-muted-foreground": props.phase.status === "done",
				"text-dim": props.phase.status === "pending",
				"text-warning": props.phase.status === "warning",
				"text-destructive": props.phase.status === "failed",
			}}
		>
			<Show
				when={props.phase.status === "active"}
				fallback={
					<Dynamic
						class="size-3.5 shrink-0"
						component={statusIcon(props.phase.status)}
					/>
				}
			>
				<span class="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
			</Show>
			{props.name}
		</button>
	);
}

function PhaseTrack(props: {
	definitions: readonly (typeof PROCESSING_PHASES)[number][];
	label: string | undefined;
	milestoneLabel: string;
	milestoneReady: boolean;
	milestoneTitle: string;
	phaseMap: Map<ProcessingPhaseId, ProcessingPhaseSummary>;
	selectedId: ProcessingPhaseId | undefined;
	onSelect: (id: ProcessingPhaseId) => void;
}) {
	return (
		<div class="flex items-start gap-1">
			<Show when={props.label}>
				<span class="w-20 shrink-0 pt-1 text-dim text-xs">{props.label}</span>
			</Show>
			<div class="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
				<For each={props.definitions}>
					{(definition, index) => (
						<Show when={props.phaseMap.get(definition.id)}>
							{(phase) => (
								<>
									<Show when={index() > 0}>
										<TrackArrow />
									</Show>
									<PhaseButton
										name={trackPhaseName(phase().name, props.label)}
										phase={phase()}
										selected={props.selectedId === phase().id}
										onSelect={() => props.onSelect(phase().id)}
									/>
								</>
							)}
						</Show>
					)}
				</For>
				<TrackArrow />
				<span
					class="inline-flex items-center gap-1.5 px-1.5 text-xs"
					classList={{
						"text-primary": props.milestoneReady,
						"text-dim": !props.milestoneReady,
					}}
					title={props.milestoneTitle}
				>
					<span
						class="size-1.5 rounded-full"
						classList={{
							"bg-primary": props.milestoneReady,
							"bg-dim": !props.milestoneReady,
						}}
					/>
					{props.milestoneLabel}
				</span>
			</div>
		</div>
	);
}

/* Inside a labeled track the phase-name prefix is redundant: the "Narration"
   row shows "Candidates", not "Narration Candidates". Details keep full names. */
function trackPhaseName(name: string, trackLabel: string | undefined) {
	if (!trackLabel || !name.startsWith(`${trackLabel} `)) return name;
	return name.slice(trackLabel.length + 1);
}

function TrackArrow() {
	return <span class="px-0.5 text-dim text-xs">→</span>;
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
							"text-warning": event().severity === "warning",
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
	return (
		<Progress
			aria-label={`${props.phase.name} progress`}
			class="mt-3"
			getValueLabel={() => progressLabel(props.phase)}
			indeterminate={props.phase.indeterminate}
			label={props.phase.progress?.label}
			maxValue={100}
			showValue
			value={progressPercent(props.phase)}
		/>
	);
}

function statusIcon(status: PhaseStatus) {
	if (status === "done") return Check;
	if (status === "failed") return X;
	if (status === "warning") return CircleAlert;
	return Dot;
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
