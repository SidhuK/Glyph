import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import {
	postprocessMarkdownFromEditor,
	preprocessMarkdownForEditor,
} from "../markdown/wikiLinkMarkdownBridge";
import { createEditorExtensions } from "./index";
import { createGlyphMathExtensions } from "./math/markdownMath";

function createMarkdownManager() {
	return new MarkdownManager({
		extensions: createEditorExtensions({
			additionalExtensions: createGlyphMathExtensions({
				onEditRequest: () => {},
			}),
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
		expect(output).toContain("| ----------- | -------------------- |");
		expect(output).toContain("| Main editor | Smart Markdown paste |");
		expect(output).toContain("```ts");
		expect(output).toContain("[[Roadmap]]");
		expect(output).toContain("[docs](https://example.com/docs)");
	});

	it("round-trips inline and display LaTeX without consuming literal dollars", () => {
		const manager = createMarkdownManager();
		const input = [
			"Energy is $E = mc^2$ and the price is $100$.",
			"",
			"$$",
			String.raw`\begin{aligned}`,
			String.raw`a &= \frac{b}{c} \\`,
			String.raw`\end{aligned}`,
			"$$",
			"",
			String.raw`Escaped \$x\$ stays literal.`,
			"",
			"`$notMath$`",
		].join("\n");

		const json = manager.parse(preprocessMarkdownForEditor(input));
		const output = postprocessMarkdownFromEditor(manager.serialize(json));

		expect(output).toContain("$E = mc^2$");
		expect(output).toContain("the price is $100$");
		expect(output).toContain("$$\n\\begin{aligned}");
		expect(output).toContain(String.raw`\frac{b}{c}`);
		expect(output).toContain(String.raw`Escaped \$x\$ stays literal.`);
		expect(output).toContain("`$notMath$`");
	});

	it("preserves multiline inline LaTeX after a Raw-mode text edit", () => {
		const manager = createMarkdownManager();
		const formula = [
			String.raw`$\begin{aligned}`,
			"  a &= b + c",
			String.raw`  x &= \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
			String.raw`\end{aligned}$`,
		].join("\n");
		const initial = `Equation: ${formula}`;

		const firstPass = postprocessMarkdownFromEditor(
			manager.serialize(manager.parse(preprocessMarkdownForEditor(initial))),
		);
		const editedInRaw = ` ${firstPass}`;
		const secondPass = postprocessMarkdownFromEditor(
			manager.serialize(
				manager.parse(preprocessMarkdownForEditor(editedInRaw)),
			),
		);

		expect(secondPass).toContain(formula);
	});
});
