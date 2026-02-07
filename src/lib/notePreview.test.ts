import { describe, expect, it } from "vitest";
import {
	joinYamlFrontmatter,
	parseNotePreview,
	splitYamlFrontmatter,
	titleForFile,
} from "./notePreview";

describe("notePreview", () => {
	it("uses frontmatter title when present", () => {
		const text = `---
title: My Note
tags: [a, b]
---
Body line`;
		expect(parseNotePreview("notes/abc.md", text).title).toBe("My Note");
	});

	it("falls back to first heading when frontmatter title is missing", () => {
		const text = `---
tags: [a]
---
# Heading Title
Body`;
		expect(parseNotePreview("notes/abc.md", text).title).toBe("Heading Title");
	});

	it("normalizes CRLF and strips frontmatter from content", () => {
		const text = "---\r\ntitle: Win\r\n---\r\nLine 1\r\nLine 2";
		expect(parseNotePreview("notes/abc.md", text).content).toBe(
			"Line 1\nLine 2",
		);
	});

	it("truncates preview content to first 20 lines", () => {
		const lines = Array.from({ length: 25 }, (_, i) => `line-${i + 1}`).join(
			"\n",
		);
		const parsed = parseNotePreview("notes/abc.md", lines);
		const previewLines = parsed.content.split("\n");
		expect(previewLines).toHaveLength(21);
		expect(previewLines[0]).toBe("line-1");
		expect(previewLines[19]).toBe("line-20");
		expect(previewLines[20]).toBe("…");
	});

	it("derives fallback title from file name", () => {
		expect(titleForFile("notes/Plan.md")).toBe("Plan");
		expect(titleForFile("notes/config.json")).toBe("config.json");
	});

	it("splits and joins YAML frontmatter consistently", () => {
		const markdown = `---
title: X
---

Body`;
		const split = splitYamlFrontmatter(markdown);
		expect(split.frontmatter).toContain("title: X");
		expect(split.body).toBe("\nBody");
		expect(joinYamlFrontmatter(split.frontmatter, split.body)).toContain(
			"title: X",
		);
	});
});
