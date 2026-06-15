import { describe, expect, test } from "bun:test";
import type { Id } from "@academic-reader/convex/data-model";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import {
	createNarrationAudioQueue,
	NarrationAudioFatalError,
} from "./narration-audio";
import { parseNarrationTtsResponse } from "./narration-tts";
import { pcmToWav } from "./pcm-wav";

const documentId = "doc" as Id<"documents">;

describe("createNarrationAudioQueue", () => {
	test("starts on first persisted text and processes enqueue order", async () => {
		const calls: string[] = [];
		const events: ProcessingEventInput[] = [];
		const queue = createNarrationAudioQueue({
			documentId,
			voice: "af_heart",
			generateAudio: async (item) => {
				calls.push(item.blockId);
				return {
					durationMs: 100,
					wordTimestampCount: 1,
					alignment: { status: "ok", source: "native" },
				};
			},
			appendEvent: (event) => {
				events.push(event);
			},
		});

		queue.enqueue([
			{ blockId: "a", text: "A" },
			{ blockId: "b", text: "B" },
		]);
		queue.enqueue([{ blockId: "c", text: "C" }]);

		expect(await queue.closeAndDrain()).toEqual({
			status: "completed",
			generatedCount: 3,
			failedBlockCount: 0,
		});
		expect(calls).toEqual(["a", "b", "c"]);
		expect(events.map((event) => event.type)).toEqual([
			"narration.audio.started",
			"narration.audio.progress",
			"narration.audio.progress",
			"narration.audio.progress",
			"narration.audio.completed",
		]);
	});

	test("continues after Block failures and stops after fatal failures", async () => {
		const blockEvents: ProcessingEventInput[] = [];
		const blockQueue = createNarrationAudioQueue({
			documentId,
			voice: "af_heart",
			generateAudio: async (item) => {
				if (item.blockId === "a") throw new Error("bad block");
				return {
					durationMs: 100,
					wordTimestampCount: 0,
					alignment: { status: "unavailable", source: "native" },
				};
			},
			appendEvent: (event) => {
				blockEvents.push(event);
			},
		});
		blockQueue.enqueue([
			{ blockId: "a", text: "A" },
			{ blockId: "b", text: "B" },
		]);

		expect(await blockQueue.closeAndDrain()).toEqual({
			status: "completed",
			generatedCount: 1,
			failedBlockCount: 1,
		});
		expect(blockEvents.map((event) => event.type)).toContain(
			"narration.audio.warning",
		);

		const fatalEvents: ProcessingEventInput[] = [];
		const fatalQueue = createNarrationAudioQueue({
			documentId,
			voice: "af_heart",
			generateAudio: async () => {
				throw new NarrationAudioFatalError("storage down");
			},
			appendEvent: (event) => {
				fatalEvents.push(event);
			},
		});
		fatalQueue.enqueue([
			{ blockId: "a", text: "A" },
			{ blockId: "b", text: "B" },
		]);

		expect(await fatalQueue.closeAndDrain()).toEqual({
			status: "failed",
			phase: "audio",
			error: "storage down",
		});
		expect(fatalEvents.map((event) => event.type)).toContain(
			"narration.audio.failed",
		);
	});
});

describe("parseNarrationTtsResponse", () => {
	test("parses audio, timestamps, and alignment", () => {
		const output = parseNarrationTtsResponse({
			audio: Buffer.from([1, 0, 2, 0]).toString("base64"),
			sampleRate: 24000,
			wordTimestamps: [
				{ word: "hello", startMs: 0, endMs: 100 },
				{ word: "bad", startMs: "x", endMs: 100 },
			],
			timing: {
				status: "ok",
				source: "forced_alignment",
				error: null,
			},
		});

		expect([...output.pcm]).toEqual([1, 0, 2, 0]);
		expect(output.sampleRate).toBe(24000);
		expect(output.wordTimestamps).toEqual([
			{ word: "hello", startMs: 0, endMs: 100 },
		]);
		expect(output.alignment).toEqual({
			status: "ok",
			source: "forced-alignment",
		});
	});
});

describe("pcmToWav", () => {
	test("wraps 16-bit mono PCM in a WAV header", () => {
		const wav = pcmToWav(new Uint8Array([1, 0, 2, 0]), 24000);

		expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
		expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
		expect(wav.readUInt32LE(24)).toBe(24000);
		expect(wav.readUInt16LE(34)).toBe(16);
		expect(wav.readUInt32LE(40)).toBe(4);
		expect([...wav.subarray(44)]).toEqual([1, 0, 2, 0]);
	});
});
