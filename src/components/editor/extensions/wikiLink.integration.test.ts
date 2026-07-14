import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { postprocessMarkdownFromEditor } from "../markdown/wikiLinkMarkdownBridge";
import { WikiLink } from "./wikiLink";

describe("WikiLink markdown manager integration", () => {
	function findWikiLinkNode(
		value: unknown,
	): { type?: string; attrs?: Record<string, unknown> } | null {
		if (!value || typeof value !== "object") return null;
		const node = value as {
			type?: string;
			attrs?: Record<string, unknown>;
			content?: unknown[];
		};
		if (node.type === "wikiLink") return node;
		for (const child of node.content ?? []) {
			const found = findWikiLinkNode(child);
			if (found) return found;
		}
		return null;
	}

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
		const out = postprocessMarkdownFromEditor(manager.serialize(json));
		expect(out).toContain("[[#Heading]]");
	});

	it("round-trips embedded image wikilinks", () => {
		const manager = new MarkdownManager({
			extensions: [StarterKit, WikiLink],
		});
		const json = manager.parse("Hero ![[assets/cover.png]]");
		const wikiLinkNode = findWikiLinkNode(json);
		expect(wikiLinkNode).not.toBeNull();
		expect(wikiLinkNode?.attrs?.target).toBe("assets/cover.png");
		expect(wikiLinkNode?.attrs?.embed).toBe(true);
		const out = manager.serialize(json);
		expect(out).toContain("![[assets/cover.png]]");
	});
});
