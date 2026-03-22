import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

describe("Code block highlighting markdown integration", () => {
	it("preserves explicit fenced languages through parse and serialize", () => {
		const manager = new MarkdownManager({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
			}),
			markedOptions: {
				gfm: true,
				breaks: false,
			},
		});

		const input = ["```ts", "const answer: number = 42;", "```"].join("\n");

		const json = manager.parse(input);
		expect(json.content?.[0]?.type).toBe("codeBlock");
		expect(json.content?.[0]?.attrs?.language).toBe("ts");

		const output = manager.serialize(json);
		expect(output).toContain("```ts");
		expect(output).toContain("const answer: number = 42;");
	});

	it("keeps plain fenced blocks language-free when no language is specified", () => {
		const manager = new MarkdownManager({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
			}),
			markedOptions: {
				gfm: true,
				breaks: false,
			},
		});

		const input = ["```", "plain text block", "```"].join("\n");

		const json = manager.parse(input);
		expect(json.content?.[0]?.type).toBe("codeBlock");
		expect(json.content?.[0]?.attrs?.language ?? null).toBeNull();

		const output = manager.serialize(json);
		expect(output).toContain("```\nplain text block\n```");
		expect(output).not.toContain("```plaintext");
	});

	it("round-trips Mermaid fences without rewriting the language", () => {
		const manager = new MarkdownManager({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
			}),
			markedOptions: {
				gfm: true,
				breaks: false,
			},
		});

		const input = [
			"```mermaid",
			"flowchart TD",
			"  A[Start] --> B[End]",
			"```",
		].join("\n");

		const json = manager.parse(input);
		expect(json.content?.[0]?.type).toBe("codeBlock");
		expect(json.content?.[0]?.attrs?.language).toBe("mermaid");

		const output = manager.serialize(json);
		expect(output).toContain("```mermaid");
		expect(output).toContain("flowchart TD");
		expect(output).toContain("A[Start] --> B[End]");
	});
});
