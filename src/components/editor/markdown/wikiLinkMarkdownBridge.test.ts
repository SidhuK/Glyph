import { describe, expect, it } from "vitest";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "./wikiLinkMarkdownBridge";

describe("wikiLinkMarkdownBridge", () => {
	it("keeps non-wikilink markdown unchanged", () => {
		const md = "# Title\n\nRegular [link](https://example.com)";
		expect(preprocessMarkdownForEditor(md)).toBe(md);
		expect(postprocessMarkdownFromEditor(md)).toBe(md);
	});

	it("canonicalizes valid wikilinks", () => {
		const md = "Jump to [[ Note#^abc | Alias ]] now";
		expect(preprocessMarkdownForEditor(md)).toBe(
			"Jump to [[Note#^abc|Alias]] now",
		);
	});

	it("bridges supported colored spans to internal editor tokens and back", () => {
		const md =
			'Use <span data-glyph-color="blue" style="color: var(--glyph-inline-color-blue)">**focus**</span> here';
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(preprocessed).toBe(
			"Use {{glyph-color:blue}}**focus**{{/glyph-color}} here",
		);
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("bridges supported highlighted marks to internal editor tokens and back", () => {
		const md =
			'Use <mark data-glyph-highlight="yellow" style="background-color: var(--glyph-inline-highlight-yellow, rgba(240, 180, 41, 0.26))">**focus**</mark> here';
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(preprocessed).toBe(
			"Use {{glyph-highlight:yellow}}**focus**{{/glyph-highlight}} here",
		);
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("preserves malformed wikilink-like text", () => {
		const md = "Bad [[#Heading]] input";
		expect(postprocessMarkdownFromEditor(md)).toBe(md);
	});

	it("leaves extra blank lines as normal markdown input", () => {
		const md = "alpha\n\n\nbeta";
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(preprocessed).toBe(md);
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("leaves whitespace-only separator lines as normal markdown input", () => {
		const md = "alpha\n \n\t\nbeta";
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(preprocessed).toBe(md);
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("preserves mixed whitespace-only lines through editor bridge round-trip", () => {
		const md = "alpha\n  \t \n\t\t\nbeta";
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("decodes legacy whitespace sentinels emitted by older editor sessions", () => {
		expect(postprocessMarkdownFromEditor("alpha\n\n\u200b\nbeta")).toBe(
			"alpha\n\n\nbeta",
		);
		expect(postprocessMarkdownFromEditor("alpha\n\u2060\u2061\nbeta")).toBe(
			"alpha\n \nbeta",
		);
	});
});
