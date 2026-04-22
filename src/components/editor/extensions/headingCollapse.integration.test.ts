// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { headingCollapsePluginKey } from "./headingCollapse";
import { createEditorExtensions } from "./index";

function createEditor(markdown: string) {
	const element = document.createElement("div");
	document.body.appendChild(element);
	const editor = new Editor({
		extensions: createEditorExtensions({
			enableSlashCommand: false,
			enableWikiLinks: false,
			enableMarkdownLinkAutocomplete: false,
		}),
		content: markdown,
		contentType: "markdown",
		element,
	});
	editor.commands.setHeadingCollapseEnabled(true);

	return {
		editor,
		element,
		destroy() {
			editor.destroy();
			element.remove();
		},
	};
}

function getHeadingPositions(editor: Editor) {
	const positions: Array<{ level: number; text: string; pos: number }> = [];
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== "heading") return;
		positions.push({
			level: Number(node.attrs.level ?? 1),
			text: node.textContent,
			pos,
		});
	});
	return positions;
}

function findBlockByText(element: HTMLElement, text: string) {
	return Array.from(element.querySelectorAll("h1, h2, h3, h4, h5, h6, p")).find(
		(node) => node.textContent?.includes(text),
	);
}

describe("Heading collapse integration", () => {
	it("collapses nested content until the next same-or-higher heading", () => {
		const harness = createEditor(
			[
				"# Alpha",
				"",
				"Alpha body",
				"",
				"## Beta",
				"",
				"Beta body",
				"",
				"### Gamma",
				"",
				"Gamma body",
				"",
				"## Delta",
				"",
				"Delta body",
			].join("\n"),
		);

		try {
			const [alpha, beta] = getHeadingPositions(harness.editor);

			harness.editor.commands.toggleHeadingCollapse(beta.pos);
			expect(findBlockByText(harness.element, "Beta")?.className).not.toContain(
				"headingCollapseHidden",
			);
			expect(
				findBlockByText(harness.element, "Gamma body")?.className,
			).toContain("headingCollapseHidden");
			expect(
				findBlockByText(harness.element, "Delta body")?.className,
			).not.toContain("headingCollapseHidden");

			harness.editor.commands.toggleHeadingCollapse(alpha.pos);
			expect(
				findBlockByText(harness.element, "Alpha body")?.className,
			).toContain("headingCollapseHidden");
			expect(
				findBlockByText(harness.element, "Delta body")?.className,
			).toContain("headingCollapseHidden");
		} finally {
			harness.destroy();
		}
	});

	it("keeps collapsed sections stable while editing heading content", () => {
		const harness = createEditor(
			["# Alpha", "", "Alpha body", "", "## Beta", "", "Beta body"].join("\n"),
		);

		try {
			const [alpha] = getHeadingPositions(harness.editor);
			harness.editor.commands.toggleHeadingCollapse(alpha.pos);
			expect(
				findBlockByText(harness.element, "Alpha body")?.className,
			).toContain("headingCollapseHidden");

			harness.editor.commands.insertContentAt(alpha.pos + 1, "Updated ");

			const pluginState = headingCollapsePluginKey.getState(
				harness.editor.state,
			);
			expect(pluginState?.collapsedPositions.size).toBe(1);
			expect(findBlockByText(harness.element, "Updated Alpha")).toBeTruthy();
			expect(
				findBlockByText(harness.element, "Alpha body")?.className,
			).toContain("headingCollapseHidden");
		} finally {
			harness.destroy();
		}
	});

	it("expands collapsed ancestors before navigating to a nested heading", () => {
		const harness = createEditor(
			[
				"# Alpha",
				"",
				"Alpha body",
				"",
				"## Beta",
				"",
				"Beta body",
				"",
				"### Gamma",
				"",
				"Gamma body",
			].join("\n"),
		);

		try {
			const [alpha, beta, gamma] = getHeadingPositions(harness.editor);

			harness.editor.commands.toggleHeadingCollapse(alpha.pos);
			harness.editor.commands.toggleHeadingCollapse(beta.pos);
			expect(
				findBlockByText(harness.element, "Gamma body")?.className,
			).toContain("headingCollapseHidden");

			harness.editor.commands.expandHeadingAncestors(gamma.pos);

			const pluginState = headingCollapsePluginKey.getState(
				harness.editor.state,
			);
			expect(pluginState?.collapsedPositions.size).toBe(0);
			expect(
				findBlockByText(harness.element, "Gamma body")?.className,
			).not.toContain("headingCollapseHidden");
		} finally {
			harness.destroy();
		}
	});

	it("still renders and toggles sections in read-only preview mode", () => {
		const harness = createEditor(
			["# Alpha", "", "Alpha body", "", "## Beta", "", "Beta body"].join("\n"),
		);

		try {
			harness.editor.setEditable(false);

			const toggle = harness.element.querySelector(
				".headingCollapseToggle",
			) as HTMLButtonElement | null;
			expect(toggle).toBeTruthy();

			toggle?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
			toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

			expect(
				findBlockByText(harness.element, "Alpha body")?.className,
			).toContain("headingCollapseHidden");
		} finally {
			harness.destroy();
		}
	});

	it("collapses and expands all headings via commands", () => {
		const harness = createEditor(
			[
				"# Alpha",
				"",
				"Alpha body",
				"",
				"## Beta",
				"",
				"Beta body",
				"",
				"# Gamma",
				"",
				"Gamma body",
			].join("\n"),
		);

		try {
			harness.editor.commands.collapseAllHeadings();
			const collapsedState = headingCollapsePluginKey.getState(
				harness.editor.state,
			);
			expect(collapsedState?.collapsedPositions.size).toBe(3);
			expect(
				findBlockByText(harness.element, "Alpha body")?.className,
			).toContain("headingCollapseHidden");
			expect(
				findBlockByText(harness.element, "Beta body")?.className,
			).toContain("headingCollapseHidden");
			expect(
				findBlockByText(harness.element, "Gamma body")?.className,
			).toContain("headingCollapseHidden");

			harness.editor.commands.expandAllHeadings();
			const expandedState = headingCollapsePluginKey.getState(
				harness.editor.state,
			);
			expect(expandedState?.collapsedPositions.size).toBe(0);
			expect(
				findBlockByText(harness.element, "Alpha body")?.className,
			).not.toContain("headingCollapseHidden");
			expect(
				findBlockByText(harness.element, "Beta body")?.className,
			).not.toContain("headingCollapseHidden");
		} finally {
			harness.destroy();
		}
	});
});
