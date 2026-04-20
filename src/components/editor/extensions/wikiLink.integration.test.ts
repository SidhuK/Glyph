import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { WikiLink } from "./wikiLink";

describe("WikiLink markdown manager integration", () => {
	it("round-trips wikilinks through parse/serialize", () => {
		const manager = new MarkdownManager({
			extensions: [StarterKit, WikiLink],
		});
		const json = manager.parse("Link [[Note#^block|Alias]]");
		const out = manager.serialize(json);
		expect(out).toContain("[[Note#^block|Alias]]");
	});

	it("keeps malformed wikilink-like text as text", () => {
		const manager = new MarkdownManager({
			extensions: [StarterKit, WikiLink],
		});
		const json = manager.parse("Invalid [[#Heading]] text");
		const out = manager.serialize(json);
		expect(out).toContain("[[#Heading]]");
	});

	it("round-trips embedded image wikilinks", () => {
		const manager = new MarkdownManager({
			extensions: [StarterKit, WikiLink],
		});
		const json = manager.parse("Hero ![[assets/cover.png]]");
		const out = manager.serialize(json);
		expect(out).toContain("![[assets/cover.png]]");
	});
});
