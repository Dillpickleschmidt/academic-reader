export const conversionModels = ["marker"] as const;
export type ConversionModel = (typeof conversionModels)[number];

export const narrationVoices = [
	{ id: "af_heart", label: "Heart", engine: "kokoro" },
	{ id: "af_bella", label: "Bella", engine: "kokoro" },
	{ id: "am_adam", label: "Adam", engine: "kokoro" },
] as const;

export type NarrationVoice = (typeof narrationVoices)[number]["id"];

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
