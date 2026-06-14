import { afterEach, describe, expect, test } from "bun:test";
import { AiConfigurationError, narrationEligibilityModel } from "./ai";

const originalEnv = {
	AI_PROVIDER: process.env.AI_PROVIDER,
	GROQ_API_KEY: process.env.GROQ_API_KEY,
	NARRATION_ELIGIBILITY_MODEL: process.env.NARRATION_ELIGIBILITY_MODEL,
};

afterEach(() => {
	restoreEnv("AI_PROVIDER", originalEnv.AI_PROVIDER);
	restoreEnv("GROQ_API_KEY", originalEnv.GROQ_API_KEY);
	restoreEnv(
		"NARRATION_ELIGIBILITY_MODEL",
		originalEnv.NARRATION_ELIGIBILITY_MODEL,
	);
});

function restoreEnv(key: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

describe("narrationEligibilityModel", () => {
	test("fails when Groq eligibility config is unsupported or incomplete", () => {
		const cases = [
			{
				provider: "openrouter",
				apiKey: "test-key",
				model: "openai/gpt-oss-120b",
				message: /AI_PROVIDER=groq/,
			},
			{
				provider: "groq",
				apiKey: undefined,
				model: "openai/gpt-oss-120b",
				message: /GROQ_API_KEY/,
			},
			{
				provider: "groq",
				apiKey: "test-key",
				model: undefined,
				message: /NARRATION_ELIGIBILITY_MODEL/,
			},
		];

		for (const config of cases) {
			process.env.AI_PROVIDER = config.provider;
			if (config.apiKey) process.env.GROQ_API_KEY = config.apiKey;
			else delete process.env.GROQ_API_KEY;
			if (config.model) process.env.NARRATION_ELIGIBILITY_MODEL = config.model;
			else delete process.env.NARRATION_ELIGIBILITY_MODEL;

			expect(() => narrationEligibilityModel()).toThrow(AiConfigurationError);
			expect(() => narrationEligibilityModel()).toThrow(config.message);
		}
	});

	test("creates the Groq eligibility model when config is present", () => {
		process.env.AI_PROVIDER = "groq";
		process.env.GROQ_API_KEY = "test-key";
		process.env.NARRATION_ELIGIBILITY_MODEL = "openai/gpt-oss-120b";

		const configured = narrationEligibilityModel();

		expect(configured.modelName).toBe("openai/gpt-oss-120b");
		expect(configured.providerOptions).toEqual({
			groq: { reasoningEffort: "low" },
		});
	});
});
