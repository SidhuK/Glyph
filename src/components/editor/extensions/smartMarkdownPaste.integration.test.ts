import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
import { createEditorExtensions } from "./index";

function createMarkdownManager() {
	return new MarkdownManager({
		extensions: createEditorExtensions({
			enableSlashCommand: false,
			enableWikiLinks: true,
		}),
		markedOptions: {
			gfm: true,
			breaks: false,
		},
	});
}

describe("smart Markdown paste integration", () => {
	it("round-trips representative AI markdown through the editor parser", () => {
		const manager = createMarkdownManager();
		const input = [
			"- [x] Ship smart paste",
			"- [ ] Add follow-up polish",
			"",
			"> [!NOTE]",
			"> Preserve AI-generated Markdown structure on paste.",
			"",
			"| Surface | Behavior |",
			"| --- | --- |",
			"| Main editor | Smart Markdown paste |",
			"",
			"```ts",
			"const feature = 'smart-paste';",
			"```",
			"",
			"See [[Roadmap]] and [docs](https://example.com/docs).",
		].join("\n");

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const output = postprocessMarkdownFromEditor(manager.serialize(json));

		expect(output).toContain("- [x] Ship smart paste");
		expect(output).toContain("> [!NOTE]");
		expect(output).toContain("| Surface     | Behavior             |");
		expect(output).toContain("| Main editor | Smart Markdown paste |");
		expect(output).toContain("```ts");
		expect(output).toContain("[[Roadmap]]");
		expect(output).toContain("[docs](https://example.com/docs)");
	});
});
