import { createGroq, type GroqProviderOptions } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

export type ModelProviderOptions =
	| { groq: Pick<GroqProviderOptions, "reasoningEffort"> }
	| undefined;

export interface ConfiguredLanguageModel {
	model: LanguageModel;
	modelName: string;
	providerOptions: ModelProviderOptions;
}

export class AiConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AiConfigurationError";
	}
}

export function narrationEligibilityModel(): ConfiguredLanguageModel {
	return groqModel({
		modelEnvKey: "NARRATION_ELIGIBILITY_MODEL",
		taskName: "Narration Eligibility Review",
	});
}

function groqModel(input: {
	modelEnvKey: string;
	taskName: string;
}): ConfiguredLanguageModel {
	const provider = envValue("AI_PROVIDER") ?? "groq";
	if (provider !== "groq") {
		throw new AiConfigurationError(
			`${input.taskName} requires AI_PROVIDER=groq; received ${provider}`,
		);
	}

	const apiKey = envValue("GROQ_API_KEY");
	if (!apiKey) {
		throw new AiConfigurationError(`${input.taskName} requires GROQ_API_KEY`);
	}

	const modelName = envValue(input.modelEnvKey);
	if (!modelName) {
		throw new AiConfigurationError(
			`${input.taskName} requires ${input.modelEnvKey}`,
		);
	}

	return {
		model: createGroq({ apiKey })(modelName),
		modelName,
		providerOptions: groqProviderOptions(modelName),
	};
}

function groqProviderOptions(modelName: string): ModelProviderOptions {
	if (modelName.startsWith("openai/gpt-oss-")) {
		return { groq: { reasoningEffort: "low" } };
	}
	return undefined;
}

function envValue(key: string) {
	return process.env[key]?.trim() || undefined;
}
