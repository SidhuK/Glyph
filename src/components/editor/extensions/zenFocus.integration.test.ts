// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./index";

function createHarness(markdown: string) {
	let zenEnabled = true;
	const element = document.createElement("div");
	document.body.appendChild(element);
	const editor = new Editor({
		extensions: createEditorExtensions({
			enableSlashCommand: false,
			enableWikiLinks: false,
			enableMarkdownLinkAutocomplete: false,
			getZenModeEnabled: () => zenEnabled,
		}),
		content: markdown,
		contentType: "markdown",
		element,
	});

	return {
		editor,
		element,
		setZenEnabled(next: boolean) {
			zenEnabled = next;
			editor.commands.refreshZenFocus();
		},
		destroy() {
			editor.destroy();
			element.remove();
		},
	};
}

function findBlock(element: HTMLElement, text: string) {
	return Array.from(element.querySelectorAll("p, h1, h2, h3, h4, h5, h6")).find(
		(node) => node.textContent?.includes(text),
	);
}

describe("ZenFocus integration", () => {
	it("marks the active block and immediate neighbors", () => {
		const harness = createHarness(
			["First paragraph", "", "Second paragraph", "", "Third paragraph"].join(
				"\n",
			),
		);

		try {
			harness.editor.commands.setTextSelection(18);

			expect(findBlock(harness.element, "Second")?.className).toContain(
				"zenFocusBlockActive",
			);
			expect(findBlock(harness.element, "First")?.className).toContain(
				"zenFocusBlockNeighbor",
			);
			expect(findBlock(harness.element, "Third")?.className).toContain(
				"zenFocusBlockNeighbor",
			);
		} finally {
			harness.destroy();
		}
	});

	it("removes focus decorations when zen mode is disabled", () => {
		const harness = createHarness(
			["Alpha", "", "Beta", "", "Gamma"].join("\n"),
		);

		try {
			harness.editor.commands.setTextSelection(9);
			expect(findBlock(harness.element, "Beta")?.className).toContain(
				"zenFocusBlockActive",
			);

			harness.setZenEnabled(false);

			expect(
				findBlock(harness.element, "Alpha")?.className ?? "",
			).not.toContain("zenFocusBlock");
			expect(findBlock(harness.element, "Beta")?.className ?? "").not.toContain(
				"zenFocusBlock",
			);
		} finally {
			harness.destroy();
		}
	});
});
