import { describe, expect, it } from "vitest";
import {
	postprocessHtmlEmbeds,
	preprocessHtmlEmbeds,
} from "./htmlEmbedMarkdown";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "./wikiLinkMarkdownBridge";

describe("htmlEmbedMarkdown", () => {
	it("keeps fenced html blocks unchanged through preprocess", () => {
		const md = "```html\n<div>Hello</div>\n```";
		expect(preprocessHtmlEmbeds(md)).toBe(md);
	});

	it("keeps fenced svg blocks unchanged through preprocess", () => {
		const md = '```svg\n<svg viewBox="0 0 10 10" />\n```';
		expect(preprocessHtmlEmbeds(md)).toBe(md);
	});

	it("round-trips fenced html blocks through postprocess", () => {
		const md = "```html\n<div>Hello</div>\n```";
		expect(postprocessHtmlEmbeds(md)).toBe(md);
	});

	it("converts raw div blocks to fenced html and back", () => {
		const md = "<div>Live</div>";
		const preprocessed = preprocessHtmlEmbeds(md);
		expect(preprocessed).toContain("```html");
		expect(preprocessed).toContain("<!--glyph-raw-html-embed-->");
		expect(postprocessHtmlEmbeds(preprocessed)).toBe(md);
	});

	it("groups adjacent raw html blocks into one fenced run", () => {
		const md = "<div>App</div>\n<script>console.log(1)</script>";
		const preprocessed = preprocessHtmlEmbeds(md);
		expect(preprocessed).toMatch(/^```html\n<!--glyph-raw-html-embed-->/);
		expect(postprocessHtmlEmbeds(preprocessed)).toBe(md);
	});

	it("leaves raw html inside existing code fences untouched", () => {
		const md = "```text\n<div>Not an embed</div>\n```";
		expect(preprocessHtmlEmbeds(md)).toBe(md);
		expect(postprocessHtmlEmbeds(md)).toBe(md);
	});

	it("classifies svg-only raw runs as svg fences", () => {
		const md =
			'<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"></svg>';
		const preprocessed = preprocessHtmlEmbeds(md);
		expect(preprocessed).toContain("```svg");
		expect(postprocessHtmlEmbeds(preprocessed)).toBe(md);
	});

	it("parses script blocks that contain a closing tag inside a string", () => {
		const md = '<script>const markup = "</script>";</script>';
		expect(preprocessHtmlEmbeds(md)).toContain("```html");
		expect(postprocessHtmlEmbeds(preprocessHtmlEmbeds(md))).toBe(md);
	});

	it("preserves content after a fenced html block on round-trip", () => {
		const md = "```html\n<div>Hi</div>\n```\nNext paragraph";
		expect(postprocessHtmlEmbeds(md)).toBe(md);
	});

	it("does not hang on a self-closing svg tag", () => {
		const md = '<svg width="1" height="1"/>';
		const preprocessed = preprocessHtmlEmbeds(md);
		expect(preprocessed).toContain("```svg");
		expect(preprocessed).toContain("<!--glyph-raw-html-embed-->");
		expect(postprocessHtmlEmbeds(preprocessed)).toBe(md);
	});
});

describe("wikiLinkMarkdownBridge html embeds", () => {
	it("round-trips fenced html embeds through the editor bridge", () => {
		const md = "```html\n<div>Bridge</div>\n```";
		expect(postprocessMarkdownFromEditor(preprocessMarkdownForEditor(md))).toBe(
			md,
		);
	});

	it("round-trips raw html embeds through the editor bridge", () => {
		const md = "<div>Bridge raw</div>";
		expect(postprocessMarkdownFromEditor(preprocessMarkdownForEditor(md))).toBe(
			md,
		);
	});
});
