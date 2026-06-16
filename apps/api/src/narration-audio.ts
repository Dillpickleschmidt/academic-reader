import type { Id } from "@academic-reader/convex/data-model";
import type { NarrationAudioAlignment } from "@academic-reader/shared/narration";
import type { ProcessingEventInput } from "@academic-reader/shared/processing-events";
import type { NarrationTextPatch } from "./narration-preparation";
import {
	appendNarrationEvent,
	upsertNarrationAudio,
} from "./narration-persistence";
import { pcmToWav } from "./pcm-wav";
import {
	NarrationTtsBlockError,
	NarrationTtsConfigurationError,
	NarrationTtsUnavailableError,
	narrationTtsEventData,
	synthesizeNarrationSpeech,
} from "./narration-tts";
import { documentNarrationAudioObjectKey, saveObject } from "./storage";

export interface NarrationAudioQueueItem {
	blockId: string;
	text: string;
}

export interface NarrationAudioGenerationResult {
	durationMs: number;
	wordTimestampCount: number;
	alignment: NarrationAudioAlignment;
}

export type NarrationAudioGenerator = (
	item: NarrationAudioQueueItem,
) => Promise<NarrationAudioGenerationResult>;

export type NarrationAudioRunResult =
	| {
			status: "completed";
			generatedCount: number;
			failedBlockCount: number;
	  }
	| { status: "failed"; phase: "audio"; error: string };

export class NarrationAudioFatalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NarrationAudioFatalError";
	}
}

export function createNarrationAudioQueue(input: {
	documentId: Id<"documents">;
	voice: string;
	generateAudio?: NarrationAudioGenerator;
	appendEvent?: (event: ProcessingEventInput) => Promise<void> | void;
}) {
	const queue: NarrationAudioQueueItem[] = [];
	const generateAudio =
		input.generateAudio ??
		((item) =>
			generateAndPersistNarrationAudio({
				documentId: input.documentId,
				voice: input.voice,
				...item,
			}));
	const appendEvent =
		input.appendEvent ??
		((event) => appendNarrationEvent(input.documentId, event));
	let closed = false;
	let worker: Promise<void> | undefined;
	let wake: (() => void) | undefined;
	let generatedCount = 0;
	let failedBlockCount = 0;
	let processedCount = 0;
	let enqueuedCount = 0;
	let fatalError: string | undefined;
	const eventData = narrationTtsEventData(input.voice);

	function enqueue(texts: NarrationTextPatch[]) {
		if (closed || fatalError) return;

		const items = texts
			.map((text) => ({ blockId: text.blockId, text: text.text.trim() }))
			.filter((item) => item.text.length > 0);
		if (!items.length) return;

		queue.push(...items);
		enqueuedCount += items.length;
		if (!worker) worker = processQueue();
		signal();
	}

	async function closeAndDrain(): Promise<NarrationAudioRunResult> {
		closed = true;
		signal();
		if (worker) await worker;
		if (fatalError)
			return { status: "failed", phase: "audio", error: fatalError };
		return { status: "completed", generatedCount, failedBlockCount };
	}

	async function processQueue() {
		await appendEvent({
			type: "narration.audio.started",
			emitter: "app",
			severity: "info",
			message: "Narration audio generation started.",
			emittedAt: Date.now(),
			progress: { current: 0, total: enqueuedCount },
			data: eventData,
		});

		while (true) {
			if (!queue.length) {
				if (closed) break;
				await waitForWork();
				continue;
			}

			const item = queue.shift();
			if (!item) continue;

			try {
				const result = await generateAudio(item);
				generatedCount += 1;
				processedCount += 1;
				await appendProgressEvent(item, result);
				if (!hasUsableWordTiming(result)) {
					await appendWordTimingWarning(item, result);
				}
			} catch (error) {
				const message = errorMessage(error);
				if (isFatalAudioError(error)) {
					fatalError = message;
					queue.length = 0;
					await appendEvent({
						type: "narration.audio.failed",
						emitter: "app",
						severity: "error",
						message,
						emittedAt: Date.now(),
						blockId: item.blockId,
						data: eventData,
					});
					break;
				}

				failedBlockCount += 1;
				processedCount += 1;
				await appendEvent({
					type: "narration.audio.warning",
					emitter: "app",
					severity: "warning",
					message: "Narration audio generation failed for a Block.",
					emittedAt: Date.now(),
					blockId: item.blockId,
					data: { ...eventData, error: message },
				});
				await appendProgressEvent(item, {
					durationMs: 0,
					wordTimestampCount: 0,
					alignment: { status: "failed", error: message },
				});
			}
		}

		if (!fatalError) {
			await appendEvent({
				type: "narration.audio.completed",
				emitter: "app",
				severity: failedBlockCount ? "warning" : "info",
				message: failedBlockCount
					? "Narration audio generation completed with Block failures."
					: "Narration audio generation completed.",
				emittedAt: Date.now(),
				progress: {
					current: processedCount,
					total: enqueuedCount,
					percent: 100,
				},
				data: {
					...eventData,
					generatedCount,
					failedBlockCount,
				},
			});
		}
	}

	async function appendWordTimingWarning(
		item: NarrationAudioQueueItem,
		result: NarrationAudioGenerationResult,
	) {
		await appendEvent({
			type: "narration.audio.warning",
			emitter: "app",
			severity: "warning",
			message:
				result.alignment.status === "failed"
					? "Narration Word Timing failed for a Block."
					: "Narration audio completed without Word Timing.",
			emittedAt: Date.now(),
			blockId: item.blockId,
			data: {
				...eventData,
				wordTimestampCount: result.wordTimestampCount,
				alignment: result.alignment,
			},
		});
	}

	async function appendProgressEvent(
		item: NarrationAudioQueueItem,
		result: NarrationAudioGenerationResult,
	) {
		await appendEvent({
			type: "narration.audio.progress",
			emitter: "app",
			severity: "info",
			message: "Narration audio queue item completed.",
			emittedAt: Date.now(),
			blockId: item.blockId,
			progress: {
				current: processedCount,
				total: enqueuedCount,
				percent: Math.round((processedCount / enqueuedCount) * 100),
			},
			data: {
				...eventData,
				durationMs: result.durationMs,
				wordTimestampCount: result.wordTimestampCount,
				alignment: result.alignment,
				generatedCount,
				failedBlockCount,
			},
		});
	}

	function waitForWork() {
		return new Promise<void>((resolve) => {
			wake = resolve;
		});
	}

	function signal() {
		wake?.();
		wake = undefined;
	}

	return { enqueue, closeAndDrain };
}

export async function generateAndPersistNarrationAudio(input: {
	documentId: Id<"documents">;
	blockId: string;
	voice: string;
	text: string;
}): Promise<NarrationAudioGenerationResult> {
	const speech = await synthesizeNarrationSpeech({
		voice: input.voice,
		text: input.text,
	});
	const storageObjectKey = documentNarrationAudioObjectKey(
		input.documentId,
		input.voice,
		input.blockId,
	);
	const durationMs = Math.round(
		(speech.pcm.length / 2 / speech.sampleRate) * 1000,
	);

	try {
		await saveObject(
			storageObjectKey,
			pcmToWav(speech.pcm, speech.sampleRate),
			{
				contentType: "audio/wav",
				cacheControl: "private, max-age=31536000, immutable",
			},
		);
		await upsertNarrationAudio(input.documentId, {
			blockId: input.blockId,
			voice: input.voice,
			storageObjectKey,
			durationMs,
			wordTimestamps: speech.wordTimestamps,
			alignment: speech.alignment,
		});
	} catch (error) {
		throw new NarrationAudioFatalError(errorMessage(error));
	}

	return {
		durationMs,
		wordTimestampCount: speech.wordTimestamps.length,
		alignment: speech.alignment,
	};
}

function hasUsableWordTiming(result: NarrationAudioGenerationResult) {
	return result.alignment.status === "ok" && result.wordTimestampCount > 0;
}

function isFatalAudioError(error: unknown) {
	return (
		error instanceof NarrationAudioFatalError ||
		error instanceof NarrationTtsConfigurationError ||
		error instanceof NarrationTtsUnavailableError
	);
}

function errorMessage(error: unknown) {
	if (error instanceof NarrationTtsBlockError) return error.message;
	return error instanceof Error ? error.message : String(error);
}
