// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";
import { MarkdownImage } from "./markdownImage";

function findImagePos(editor: Editor) {
	let imagePos = -1;
	editor.state.doc.descendants((node, pos) => {
		if (imagePos !== -1) return false;
		if (node.type.name !== "image") return true;
		imagePos = pos;
		return false;
	});
	return imagePos;
}

describe("MarkdownImage markdown manager integration", () => {
	it("parses image markdown into an image node and serializes back", () => {
		const manager = new MarkdownManager({
			extensions: [StarterKit, MarkdownImage],
		});

		const input = "Before ![Alt text](../assets/example.png) after";
		const json = manager.parse(input);
		const paragraph = json.content?.[0];
		const imageNode = paragraph?.content?.find((node) => node.type === "image");

		expect(imageNode?.type).toBe("image");
		expect(imageNode?.attrs?.src).toBe("../assets/example.png");
		expect(imageNode?.attrs?.alt).toBe("Alt text");

		const output = manager.serialize(json);
		expect(output).toContain("![Alt text](../assets/example.png)");
	});

	it("renders a standalone markdown image when the editor opens", () => {
		const element = document.createElement("div");
		document.body.appendChild(element);
		const editor = new Editor({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
				enableMarkdownLinkAutocomplete: false,
			}),
			content: "![](img.png)",
			contentType: "markdown",
			element,
		});

		try {
			const image = element.querySelector("img");
			expect(image?.getAttribute("src")).toBe("img.png");
			expect(element.textContent).not.toContain("![](img.png)");
		} finally {
			editor.destroy();
			element.remove();
		}
	});

	it("collapses expanded image markdown when the selection moves away", () => {
		const element = document.createElement("div");
		document.body.appendChild(element);
		const editor = new Editor({
			extensions: createEditorExtensions({
				enableSlashCommand: false,
				enableWikiLinks: false,
				enableMarkdownLinkAutocomplete: false,
			}),
			content: ["![](img.png)", "", "after"].join("\n"),
			contentType: "markdown",
			element,
		});

		try {
			const imagePos = findImagePos(editor);
			expect(imagePos).toBeGreaterThanOrEqual(0);
			editor.view.dispatch(
				editor.state.tr.setSelection(
					NodeSelection.create(editor.state.doc, imagePos),
				),
			);
			expect(element.textContent).toContain("![](img.png)");

			editor.commands.setTextSelection(editor.state.doc.content.size);

			const image = element.querySelector("img");
			expect(image?.getAttribute("src")).toBe("img.png");
			expect(element.textContent).not.toContain("![](img.png)");
			expect(editor.state.selection.empty).toBe(true);
		} finally {
			editor.destroy();
			element.remove();
		}
	});
});
