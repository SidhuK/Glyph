import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";
import { HtmlCommentBlock, HtmlCommentInline } from "../extensions/htmlComment";
import { postprocessMarkdownFromEditor, preprocessMarkdownForEditor } from "./editorMarkdownBridge";

function roundTripThroughEditor(markdown: string): string {
	const manager = new MarkdownManager({
		extensions: [StarterKit, HtmlCommentBlock, HtmlCommentInline],
		markedOptions: { gfm: true, breaks: false },
	});
	return postprocessMarkdownFromEditor(
		manager.serialize(manager.parse(preprocessMarkdownForEditor(markdown))),
	);
}

describe("editorMarkdownBridge", () => {
	it("preserves literal escaped footnotes", () => {
		expect(roundTripThroughEditor(String.raw`Literal \[^note\] text`)).toBe(
			String.raw`Literal \[^note\] text`,
		);
	});

	it("preserves footnote IDs containing a backslash", () => {
		expect(roundTripThroughEditor(String.raw`See [^a\b].`)).toBe(String.raw`See [^a\b].`);
	});

	it("preserves footnote references and definitions", () => {
		const markdown = "See [^note].\n\n[^note]: Footnote text";
		const preprocessed = preprocessMarkdownForEditor(markdown);
		expect(preprocessed).toContain(String.raw`\[^note\]`);
		expect(roundTripThroughEditor(markdown)).toContain("See [^note].");
		expect(roundTripThroughEditor(markdown)).toContain("[^note]: Footnote text");
	});

	it("preserves comments followed by text", () => {
		expect(roundTripThroughEditor("<!--page break--> text")).toBe("<!--page break--> text");
		expect(roundTripThroughEditor("<!--\npage break\n--> text")).toBe("<!--\npage break\n--> text");
	});

	it("preserves standalone and inline comments", () => {
		expect(roundTripThroughEditor("<!--page break-->\n\nBefore <!--note--> after")).toContain(
			"<!--page break-->",
		);
		expect(roundTripThroughEditor("Before <!--note--> after")).toBe("Before <!--note--> after");
	});

	it("preserves footnotes after a fence-looking line inside a comment", () => {
		const markdown = "<!-- note\n```\n-->\n\nSee [^note].";
		expect(roundTripThroughEditor(markdown)).toContain("See [^note].");
	});

	it("does not treat an inline code comment marker as a comment", () => {
		const markdown = "`<!--` See [^note].";
		expect(roundTripThroughEditor(markdown)).toContain("See [^note].");
	});
	it("keeps non-wikilink markdown unchanged", () => {
		const md = "# Title\n\nRegular [link](https://example.com)";
		expect(preprocessMarkdownForEditor(md)).toBe(md);
		expect(postprocessMarkdownFromEditor(md)).toBe(md);
	});

	it("canonicalizes valid wikilinks", () => {
		const md = "Jump to [[ Note#^abc | Alias ]] now";
		expect(preprocessMarkdownForEditor(md)).toBe("Jump to [[Note#^abc|Alias]] now");
	});

	it("bridges supported colored spans to internal editor tokens and back", () => {
		const md =
			'Use <span data-glyph-color="blue" style="color: var(--glyph-inline-color-blue)">**focus**</span> here';
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(preprocessed).toBe("Use {{glyph-color:blue}}**focus**{{/glyph-color}} here");
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("bridges supported highlighted marks to internal editor tokens and back", () => {
		const md =
			'Use <mark data-glyph-highlight="yellow" style="background-color: var(--glyph-inline-highlight-yellow, rgba(240, 180, 41, 0.26))">**focus**</mark> here';
		const preprocessed = preprocessMarkdownForEditor(md);
		expect(preprocessed).toBe("Use {{glyph-highlight:yellow}}**focus**{{/glyph-highlight}} here");
		expect(postprocessMarkdownFromEditor(preprocessed)).toBe(md);
	});

	it("preserves malformed wikilink-like text", () => {
		const md = "Bad [[#Heading]] input";
		expect(postprocessMarkdownFromEditor(md)).toBe(md);
	});

	it("restores escaped callout markers with numeric kinds and folds", () => {
		const serialized = [String.raw`> \[!NOTE2\]-`, String.raw`> \[!TIP\]+`].join("\n");

		expect(postprocessMarkdownFromEditor(serialized)).toBe("> [!NOTE2]-\n> [!TIP]+");
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
		expect(postprocessMarkdownFromEditor("alpha\n\n\u200b\nbeta")).toBe("alpha\n\n\nbeta");
		expect(postprocessMarkdownFromEditor("alpha\n\u2060\u2061\nbeta")).toBe("alpha\n \nbeta");
	});

	it("preserves escaped dollar signs through editor bridge round-trip", () => {
		const md = String.raw`Price is \$5 and math is $x^2$.`;
		expect(postprocessMarkdownFromEditor(preprocessMarkdownForEditor(md))).toBe(md);
	});

	it("preserves literal placeholder sentinels through editor bridge round-trip", () => {
		const md = "Marker \uE000 and escape \uE001 here";
		expect(postprocessMarkdownFromEditor(preprocessMarkdownForEditor(md))).toBe(md);
	});
});
