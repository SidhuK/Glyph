import { describe, expect, it } from "vite-plus/test";
import {
	formatModelId,
	guessOpenRouterProvider,
	resolveLogoProvider,
} from "./modelSelectorConstants";

describe("OpenRouter provider logo hints", () => {
	it("does not classify Meta Llama models as llama.cpp", () => {
		expect(guessOpenRouterProvider("meta-llama/llama-3.1-8b-instruct")).toBe(null);
		expect(resolveLogoProvider("openrouter", "meta-llama/llama-4-scout")).toBe("openrouter");
	});

	it("still detects explicit llama.cpp model names", () => {
		expect(guessOpenRouterProvider("local/llama.cpp-qwen")).toBe("llama_cpp");
		expect(guessOpenRouterProvider("local/llama_cpp-qwen")).toBe("llama_cpp");
	});
});

describe("formatModelId", () => {
	it("turns raw ids into readable names", () => {
		expect(formatModelId("claude-opus-5-5")).toBe("Claude Opus 5.5");
		expect(formatModelId("claude-sonnet-4-5-20250929")).toBe("Claude Sonnet 4.5");
		expect(formatModelId("gpt-4o-mini-2024-07-18")).toBe("GPT 4o Mini");
		expect(formatModelId("anthropic/claude-3.5-sonnet")).toBe("Claude 3.5 Sonnet");
		expect(formatModelId("models/gemini-2.5-pro")).toBe("Gemini 2.5 Pro");
		expect(formatModelId("qwen2.5:7b")).toBe("Qwen2.5 7B");
		expect(formatModelId("o3-mini")).toBe("o3 Mini");
	});
});
