import { describe, expect, it } from "vitest";
import { looksLikeMarkdownPaste } from "./markdownPaste";

describe("looksLikeMarkdownPaste", () => {
	it("detects block-style markdown constructs", () => {
		expect(looksLikeMarkdownPaste("# Heading")).toBe(true);
		expect(looksLikeMarkdownPaste("- bullet")).toBe(true);
		expect(looksLikeMarkdownPaste("1. ordered")).toBe(true);
		expect(looksLikeMarkdownPaste("- [x] task")).toBe(true);
		expect(looksLikeMarkdownPaste("> quote")).toBe(true);
		expect(looksLikeMarkdownPaste("> [!NOTE]\n> Callout")).toBe(true);
		expect(looksLikeMarkdownPaste("```\n```")).toBe(true);
		expect(looksLikeMarkdownPaste("```ts\nconst answer = 42;\n```")).toBe(true);
		expect(looksLikeMarkdownPaste("| Name |\n| --- |")).toBe(true);
		expect(looksLikeMarkdownPaste("Name | Role\n--- | ---")).toBe(true);
		expect(
			looksLikeMarkdownPaste("| Name | Role |\n| --- | --- |\n| Ada | Eng |"),
		).toBe(true);
	});

	it("detects inline markdown constructs", () => {
		expect(looksLikeMarkdownPaste("Use **bold** text")).toBe(true);
		expect(looksLikeMarkdownPaste("Use *italic* text")).toBe(true);
		expect(looksLikeMarkdownPaste("Use ~~done~~ text")).toBe(true);
		expect(looksLikeMarkdownPaste("Use `code` here")).toBe(true);
		expect(looksLikeMarkdownPaste("Read [Glyph](https://example.com)")).toBe(
			true,
		);
		expect(
			looksLikeMarkdownPaste("![Diagram](https://example.com/diagram.png)"),
		).toBe(true);
		expect(looksLikeMarkdownPaste("Jump to [[Daily Note]]")).toBe(true);
	});

	it("ignores ordinary prose", () => {
		expect(
			looksLikeMarkdownPaste(
				"This is regular pasted text with no formatting syntax at all.",
			),
		).toBe(false);
		expect(
			looksLikeMarkdownPaste("Budget is 1.5x higher than last quarter."),
		).toBe(false);
		expect(looksLikeMarkdownPaste("")).toBe(false);
	});
});
