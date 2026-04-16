import { describe, expect, it } from "vitest";
import {
	guessOpenRouterProvider,
	resolveLogoProvider,
} from "./modelSelectorConstants";

describe("OpenRouter provider logo hints", () => {
	it("does not classify Meta Llama models as llama.cpp", () => {
		expect(guessOpenRouterProvider("meta-llama/llama-3.1-8b-instruct")).toBe(
			null,
		);
		expect(resolveLogoProvider("openrouter", "meta-llama/llama-4-scout")).toBe(
			"openrouter",
		);
	});

	it("still detects explicit llama.cpp model names", () => {
		expect(guessOpenRouterProvider("local/llama.cpp-qwen")).toBe("llama_cpp");
		expect(guessOpenRouterProvider("local/llama_cpp-qwen")).toBe("llama_cpp");
	});
});
