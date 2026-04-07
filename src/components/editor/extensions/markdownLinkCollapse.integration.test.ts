// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

function createHarness() {
	const element = document.createElement("div");
	document.body.appendChild(element);
	const editor = new Editor({
		extensions: createEditorExtensions({
			enableSlashCommand: false,
			enableWikiLinks: false,
			enableMarkdownLinkAutocomplete: false,
		}),
		content: "Placeholder",
		contentType: "markdown",
		element,
	});

	return {
		editor,
		element,
		destroy() {
			editor.destroy();
			element.remove();
		},
	};
}

describe("Markdown link collapse integration", () => {
	it("turns expanded markdown link text back into a rendered link after the caret leaves it", () => {
		const harness = createHarness();
		const raw = "[Emil Kowalski](https://x.com/emilkowalski_)";
		const hrefStart = raw.indexOf("https://x.com/emilkowalski_");
		const hrefEnd = hrefStart + "https://x.com/emilkowalski_".length;

		try {
			let tr = harness.editor.state.tr.insertText(raw, 1, 12);
			tr = tr.setSelection(
				TextSelection.create(tr.doc, 1 + hrefStart, 1 + hrefEnd),
			);
			harness.editor.view.dispatch(tr);

			expect(harness.element.textContent).toContain(raw);

			harness.editor.commands.setTextSelection(
				harness.editor.state.doc.content.size,
			);

			const link = harness.element.querySelector("a");
			expect(link?.textContent).toBe("Emil Kowalski");
			expect(link?.getAttribute("href")).toBe("https://x.com/emilkowalski_");
			expect(harness.element.textContent).not.toContain(raw);
		} finally {
			harness.destroy();
		}
	});

	it("does not collapse markdown link text inside inline code or code blocks", () => {
		const harness = createHarness();
		const inlineInput = "Before `[Emil](https://x.com/emilkowalski_)` after";
		const blockInput = "```md\n[Emil](https://x.com/emilkowalski_)\n```";

		try {
			harness.editor.commands.setContent(inlineInput, {
				contentType: "markdown",
			});
			harness.editor.commands.setTextSelection(
				harness.editor.state.doc.content.size,
			);

			expect(harness.editor.getMarkdown()).toContain(
				"`[Emil](https://x.com/emilkowalski_)`",
			);
			expect(harness.element.querySelector("code a")).toBeNull();

			harness.editor.commands.setContent(blockInput, {
				contentType: "markdown",
			});
			harness.editor.commands.setTextSelection(
				harness.editor.state.doc.content.size,
			);

			expect(harness.editor.getMarkdown()).toContain(
				"[Emil](https://x.com/emilkowalski_)",
			);
			expect(harness.element.querySelector("pre a")).toBeNull();
		} finally {
			harness.destroy();
		}
	});
});
