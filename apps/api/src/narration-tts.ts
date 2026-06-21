import { Buffer } from "node:buffer";
import type {
	NarrationAudioAlignment,
	NarrationWordTimestamp,
} from "@academic-reader/shared/narration";
import { narrationVoiceById } from "@academic-reader/shared/processing";

export interface SynthesizedNarrationSpeech {
	pcm: Uint8Array;
	sampleRate: number;
	wordTimestamps: NarrationWordTimestamp[];
	alignment: NarrationAudioAlignment;
}

export class NarrationTtsConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NarrationTtsConfigurationError";
	}
}

export class NarrationTtsUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NarrationTtsUnavailableError";
	}
}

export class NarrationTtsBlockError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NarrationTtsBlockError";
	}
}

const ttsRequestTimeoutMs = 10 * 60 * 1000;

export function narrationTtsEventData(voiceId: string) {
	try {
		const runtime = narrationTtsRuntime(voiceId);
		return {
			voice: voiceId,
			backend: runtime.backend,
			engine: runtime.engine,
			workerHost: new URL(runtime.workerUrl).host,
		};
	} catch {
		return {
			voice: voiceId,
			backend: optionalEnv("TTS_BACKEND") ?? "local",
		};
	}
}

export async function synthesizeNarrationSpeech(input: {
	voice: string;
	text: string;
}): Promise<SynthesizedNarrationSpeech> {
	const runtime = narrationTtsRuntime(input.voice);
	let response: Response;
	try {
		response = await fetch(`${runtime.workerUrl}/synthesize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: input.text, voice_id: input.voice }),
			signal: AbortSignal.timeout(ttsRequestTimeoutMs),
		});
	} catch (error) {
		throw new NarrationTtsUnavailableError(errorMessage(error));
	}

	if (!response.ok) {
		const message = `${response.status}: ${await response.text()}`;
		if (response.status >= 500) {
			throw new NarrationTtsUnavailableError(message);
		}
		throw new NarrationTtsBlockError(message);
	}

	try {
		return parseNarrationTtsResponse(await response.json());
	} catch (error) {
		throw new NarrationTtsUnavailableError(errorMessage(error));
	}
}

export function parseNarrationTtsResponse(
	value: unknown,
): SynthesizedNarrationSpeech {
	if (!isRecord(value) || typeof value.audio !== "string") {
		throw new Error("Narration TTS response is missing audio");
	}
	if (typeof value.sampleRate !== "number" || value.sampleRate <= 0) {
		throw new Error("Narration TTS response is missing sampleRate");
	}

	const pcm = Buffer.from(value.audio, "base64");
	if (!pcm.length) throw new Error("Narration TTS response audio is empty");

	return {
		pcm,
		sampleRate: value.sampleRate,
		wordTimestamps: Array.isArray(value.wordTimestamps)
			? value.wordTimestamps.filter(isWordTimestamp)
			: [],
		alignment: parseAlignment(value.timing),
	};
}

function narrationTtsRuntime(voiceId: string) {
	const voice = narrationVoiceById(voiceId);
	if (!voice) {
		throw new NarrationTtsConfigurationError(
			`Unknown Narration voice: ${voiceId}`,
		);
	}
	const backend = optionalEnv("TTS_BACKEND") ?? "local";
	if (backend === "none") {
		throw new NarrationTtsConfigurationError(
			"Narration audio generation requires TTS_BACKEND=local or modal",
		);
	}
	if (backend === "local") {
		return {
			backend,
			engine: voice.engine,
			workerUrl: ttsWorkerUrl({ backend, engine: voice.engine }),
		};
	}
	if (backend === "modal") {
		return {
			backend,
			engine: voice.engine,
			workerUrl: ttsWorkerUrl({ backend, engine: voice.engine }),
		};
	}

	throw new NarrationTtsConfigurationError(
		"TTS_BACKEND must be local, modal, or none",
	);
}

function ttsWorkerUrl(input: { backend: "local" | "modal"; engine: string }) {
	if (input.engine === "kokoro") {
		return (
			input.backend === "local"
				? (optionalEnv("KOKORO_TTS_WORKER_URL") ?? "http://localhost:8801")
				: requireEnv("MODAL_KOKORO_TTS_URL")
		).replace(/\/$/, "");
	}
	if (input.engine === "qwen3") {
		return (
			input.backend === "local"
				? (optionalEnv("QWEN3_TTS_WORKER_URL") ?? "http://localhost:8802")
				: requireEnv("MODAL_QWEN3_TTS_URL")
		).replace(/\/$/, "");
	}

	throw new NarrationTtsConfigurationError(
		`Unsupported Narration TTS engine: ${input.engine}`,
	);
}

function parseAlignment(value: unknown): NarrationAudioAlignment {
	if (!isRecord(value)) return { status: "unavailable" };

	const status = validAlignmentStatus(value.status);
	const source = validAlignmentSource(value.source);
	const error =
		typeof value.error === "string" && value.error ? value.error : undefined;

	return {
		status: status ?? "unavailable",
		...(source ? { source } : {}),
		...(error ? { error } : {}),
	};
}

function validAlignmentStatus(value: unknown) {
	if (value === "ok" || value === "unavailable" || value === "failed") {
		return value;
	}
	return null;
}

function validAlignmentSource(value: unknown) {
	if (value === "native" || value === "forced-alignment") return value;
	if (value === "forced_alignment") return "forced-alignment";
	return null;
}

function isWordTimestamp(value: unknown): value is NarrationWordTimestamp {
	return (
		isRecord(value) &&
		typeof value.word === "string" &&
		typeof value.startMs === "number" &&
		typeof value.endMs === "number"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object";
}

function optionalEnv(key: string) {
	return process.env[key]?.trim() || undefined;
}

function requireEnv(key: string) {
	const value = optionalEnv(key);
	if (!value) throw new NarrationTtsConfigurationError(`${key} is required`);
	return value;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
