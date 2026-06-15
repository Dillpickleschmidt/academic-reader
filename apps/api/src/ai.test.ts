import { afterEach, describe, expect, test } from "bun:test";
import {
	AiConfigurationError,
	narrationEligibilityModel,
	narrationGuideModel,
	narrationRewriteModel,
} from "./ai";

const modelConfigs = [
	{
		envKey: "NARRATION_ELIGIBILITY_MODEL",
		model: narrationEligibilityModel,
	},
	{ envKey: "NARRATION_GUIDE_MODEL", model: narrationGuideModel },
	{ envKey: "NARRATION_REWRITE_MODEL", model: narrationRewriteModel },
] as const;

const originalEnv = {
	AI_PROVIDER: process.env.AI_PROVIDER,
	GROQ_API_KEY: process.env.GROQ_API_KEY,
	NARRATION_ELIGIBILITY_MODEL: process.env.NARRATION_ELIGIBILITY_MODEL,
	NARRATION_GUIDE_MODEL: process.env.NARRATION_GUIDE_MODEL,
	NARRATION_REWRITE_MODEL: process.env.NARRATION_REWRITE_MODEL,
};

afterEach(() => {
	restoreEnv("AI_PROVIDER", originalEnv.AI_PROVIDER);
	restoreEnv("GROQ_API_KEY", originalEnv.GROQ_API_KEY);
	for (const config of modelConfigs) {
		restoreEnv(config.envKey, originalEnv[config.envKey]);
	}
});

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

describe("narration task models", () => {
	test("fail when Groq config is unsupported or incomplete", () => {
		const cases = [
			{
				model: narrationEligibilityModel,
				setup: () => {
					setValidGroqConfig();
					process.env.AI_PROVIDER = "openrouter";
				},
				message: /AI_PROVIDER=groq/,
			},
			{
				model: narrationGuideModel,
				setup: () => {
					setValidGroqConfig();
					delete process.env.GROQ_API_KEY;
				},
				message: /GROQ_API_KEY/,
			},
			...modelConfigs.map((config) => ({
				model: config.model,
				setup: () => {
					setValidGroqConfig();
					delete process.env[config.envKey];
				},
				message: new RegExp(config.envKey),
			})),
		];

		for (const config of cases) {
			config.setup();
			expect(() => config.model()).toThrow(AiConfigurationError);
			expect(() => config.model()).toThrow(config.message);
		}
	});

	test("create Groq task models when config is present", () => {
		setValidGroqConfig();

		for (const config of modelConfigs) {
			const configured = config.model();

			expect(configured.modelName).toBe("openai/gpt-oss-120b");
			expect(configured.providerOptions).toEqual({
				groq: { reasoningEffort: "low" },
			});
		}
	});
});

function setValidGroqConfig() {
	process.env.AI_PROVIDER = "groq";
	process.env.GROQ_API_KEY = "test-key";
	for (const config of modelConfigs) {
		process.env[config.envKey] = "openai/gpt-oss-120b";
	}
}
