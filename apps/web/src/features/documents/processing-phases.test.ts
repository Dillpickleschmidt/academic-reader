import {
	isTerminalEventType,
	processingEventTypes,
} from "@academic-reader/shared/processing-events";
import {
	applyProcessingEventToProgressSummary,
	deriveProcessingProgressSummary,
	emptyProcessingProgressSummary,
	eventTypePhase,
	PROCESSING_PHASES,
	type ProcessingEventRecord,
	readerViewReady,
} from "@academic-reader/shared/processing-phases";
import { describe, expect, test } from "vitest";

let seq = 0;
function event(
	partial: Partial<ProcessingEventRecord> & {
		type: ProcessingEventRecord["type"];
	},
): ProcessingEventRecord {
	seq += 1;
	return {
		_id: `e${seq}`,
		_creationTime: seq,
		documentId: "d1",
		emitter: "app",
		severity: "info",
		message: partial.type,
		emittedAt: seq,
		...partial,
	};
}

describe("event-to-phase mapping", () => {
	test("every Processing Event type maps to a known phase", () => {
		const phaseIds = new Set(PROCESSING_PHASES.map((p) => p.id));
		for (const type of processingEventTypes) {
			const phase = eventTypePhase[type];
			expect(phase, `missing mapping for ${type}`).toBeDefined();
			expect(phaseIds.has(phase), `unknown phase for ${type}`).toBe(true);
		}
	});

	test("no event is dropped from phase counts", () => {
		const events = processingEventTypes.map((type) => event({ type }));
		const summary = deriveProcessingProgressSummary(events, "processing");
		const distributedCount = summary.phases.reduce(
			(count, phase) => count + phase.eventCount,
			0,
		);

		expect(distributedCount).toBe(events.length);
		expect(summary.eventCount).toBe(events.length);
	});
});

describe("deriveProcessingProgressSummary status", () => {
	test("pending when a phase has no events", () => {
		const phases = phasesFor(
			[event({ type: "processing.started" })],
			"processing",
		);
		expect(byId(phases, "audio").status).toBe("pending");
	});

	test("active on started, done on completed", () => {
		const active = phasesFor(
			[event({ type: "narration.rewrite.started" })],
			"ready",
		);
		expect(byId(active, "rewrite").status).toBe("active");

		const done = phasesFor(
			[
				event({ type: "narration.rewrite.started" }),
				event({ type: "narration.rewrite.completed" }),
			],
			"ready",
		);
		expect(byId(done, "rewrite").status).toBe("done");
	});

	test("completed with a warning event resolves to warning", () => {
		const phases = phasesFor(
			[
				event({ type: "narration.audio.started" }),
				event({ type: "narration.audio.warning", severity: "warning" }),
				event({ type: "narration.audio.completed" }),
			],
			"ready",
		);
		const audio = byId(phases, "audio");
		expect(audio.status).toBe("warning");
		expect(audio.warningCount).toBe(1);
	});

	test("failed event wins", () => {
		const phases = phasesFor(
			[
				event({ type: "narration.audio.started" }),
				event({ type: "narration.audio.failed", severity: "error" }),
			],
			"ready",
		);
		expect(byId(phases, "audio").status).toBe("failed");
	});
});

describe("conversion follows Document readiness", () => {
	test("ready marks conversion done even without a completed event", () => {
		const phases = phasesFor([event({ type: "conversion.started" })], "ready");
		expect(byId(phases, "conversion").status).toBe("done");
		expect(readerViewReady("ready")).toBe(true);
	});

	test("readyWithWarnings marks conversion warning", () => {
		const phases = phasesFor(
			[event({ type: "conversion.started" })],
			"readyWithWarnings",
		);
		expect(byId(phases, "conversion").status).toBe("warning");
	});

	test("failed status marks conversion failed", () => {
		const phases = phasesFor([event({ type: "conversion.started" })], "failed");
		expect(byId(phases, "conversion").status).toBe("failed");
		expect(readerViewReady("failed")).toBe(false);
	});
});

describe("progress", () => {
	test("uses the latest numeric reading and is determinate", () => {
		const phases = phasesFor(
			[
				event({
					type: "narration.eligibility.progress",
					progress: { current: 10, total: 100, percent: 10 },
				}),
				event({
					type: "narration.eligibility.progress",
					progress: { current: 80, total: 100, percent: 80 },
				}),
			],
			"ready",
		);
		const eligibility = byId(phases, "eligibility");
		expect(eligibility.progress?.percent).toBe(80);
		expect(eligibility.indeterminate).toBe(false);
	});

	test("active without a numeric reading is indeterminate", () => {
		const phases = phasesFor(
			[event({ type: "narration.candidates.started" })],
			"ready",
		);
		expect(byId(phases, "candidates").indeterminate).toBe(true);
	});
});

describe("progress summary projection", () => {
	test("keeps compact phase state without retaining full event history", () => {
		const events = [
			event({ type: "narration.audio.started" }),
			event({
				type: "narration.audio.progress",
				message: "Halfway there.",
				progress: { current: 5, total: 10, label: "Audio" },
			}),
		];
		const summary = deriveProcessingProgressSummary(events, "ready");
		const audio = summary.phases.find((phase) => phase.id === "audio");

		expect(summary.eventCount).toBe(2);
		expect(audio?.eventCount).toBe(2);
		expect("events" in (audio ?? {})).toBe(false);
		expect(audio?.latestEvent?.message).toBe("Halfway there.");
		expect(audio?.progress?.current).toBe(5);
	});

	test("incremental reducer matches deriving from the full event list", () => {
		const events = [
			event({ type: "narration.rewrite.started" }),
			event({
				type: "narration.rewrite.progress",
				progress: { current: 1, total: 2 },
			}),
			event({ type: "narration.rewrite.completed" }),
		];
		const fromFullHistory = deriveProcessingProgressSummary(events, "ready");
		const incremental = events.reduce(
			(summary, nextEvent) =>
				applyProcessingEventToProgressSummary(summary, nextEvent, "ready"),
			emptyProcessingProgressSummary("d1", "ready"),
		);

		expect(incremental).toEqual(fromFullHistory);
	});
});

describe("run activity from events (library zoning)", () => {
	test("terminal events conclude a phase; in-flight ones do not", () => {
		expect(isTerminalEventType("narration.audio.completed")).toBe(true);
		expect(isTerminalEventType("narration.eligibility.completed")).toBe(true);
		expect(isTerminalEventType("conversion.failed")).toBe(true);
		expect(isTerminalEventType("narration.audio.progress")).toBe(false);
		expect(isTerminalEventType("narration.rewrite.started")).toBe(false);
		expect(isTerminalEventType("narration.audio.warning")).toBe(false);
	});
});

function phasesFor(events: ProcessingEventRecord[], processingStatus: string) {
	return deriveProcessingProgressSummary(events, processingStatus).phases;
}

function byId(phases: ReturnType<typeof phasesFor>, id: string) {
	const phase = phases.find((p) => p.id === id);
	if (!phase) throw new Error(`phase ${id} not found`);
	return phase;
}
