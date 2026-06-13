export const conversionModels = ["marker"] as const;
export type ConversionModel = (typeof conversionModels)[number];

export const narrationVoices = [
	{ id: "af_heart", label: "Heart" },
	{ id: "af_bella", label: "Bella" },
	{ id: "am_adam", label: "Adam" },
] as const;

export type NarrationVoice = (typeof narrationVoices)[number]["id"];

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
