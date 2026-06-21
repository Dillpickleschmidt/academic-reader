export const conversionModels = ["marker"] as const;
export type ConversionModel = (typeof conversionModels)[number];

export const narrationVoiceIds = [
	"af_heart",
	"af_bella",
	"am_adam",
	"male_1",
] as const;

export type NarrationVoice = (typeof narrationVoiceIds)[number];

export const narrationVoiceEngines = ["kokoro", "qwen3"] as const;
export type NarrationVoiceEngine = (typeof narrationVoiceEngines)[number];

export const narrationVoices = [
	{ id: "af_heart", label: "Heart", engine: "kokoro" },
	{ id: "af_bella", label: "Bella", engine: "kokoro" },
	{ id: "am_adam", label: "Adam", engine: "kokoro" },
	{ id: "male_1", label: "Male 1", engine: "qwen3" },
] as const satisfies readonly {
	id: NarrationVoice;
	label: string;
	engine: NarrationVoiceEngine;
}[];

export function narrationVoiceById(id: string) {
	return narrationVoices.find((voice) => voice.id === id);
}

export const defaultProcessingConfiguration = {
	conversionModel: "marker" satisfies ConversionModel,
	pageRange: "",
	markerOptions: {
		forceOcr: false,
		useLlm: true,
	},
	narration: {
		enabled: true,
		voice: "af_heart" satisfies NarrationVoice,
	},
};
