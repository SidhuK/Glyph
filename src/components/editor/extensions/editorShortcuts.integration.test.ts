// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vitest";
import { createEditorShortcutsExtension } from "./editorShortcuts";

function createEditor(handlers: {
	onEscape?: () => void;
	onSave?: () => void;
}) {
	const element = document.createElement("div");
	document.body.append(element);
	const handlersRef = { current: handlers };
	const editor = new Editor({
		extensions: [
			StarterKit,
			createEditorShortcutsExtension(() => handlersRef.current),
		],
		content: "<p>hello</p>",
		element,
	});

	return {
		editor,
		destroy() {
			editor.destroy();
			element.remove();
		},
	};
}

function isMacPlatform() {
	return /Mac/.test(navigator.platform);
}

function press(
	editor: Editor,
	key: string,
	modifiers: Partial<KeyboardEventInit> = {},
) {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key,
		code: key,
		...modifiers,
	});
	editor.commands.focus();
	editor.view.dom.dispatchEvent(event);
	return event.defaultPrevented;
}

function pressModEnter(editor: Editor) {
	return press(editor, "Enter", {
		metaKey: isMacPlatform(),
		ctrlKey: !isMacPlatform(),
	});
}

describe("createEditorShortcutsExtension", () => {
	it("calls onSave for Mod+Enter when no overlay is open", () => {
		const onSave = vi.fn();
		const harness = createEditor({ onSave });

		try {
			expect(pressModEnter(harness.editor)).toBe(true);
			expect(onSave).toHaveBeenCalledTimes(1);
		} finally {
			harness.destroy();
		}
	});

	it("calls onEscape when no overlay is open", () => {
		const onEscape = vi.fn();
		const harness = createEditor({ onEscape });

		try {
			expect(press(harness.editor, "Escape")).toBe(true);
			expect(onEscape).toHaveBeenCalledTimes(1);
		} finally {
			harness.destroy();
		}
	});

	it("does not call onEscape when a slash menu is open", () => {
		const onEscape = vi.fn();
		const harness = createEditor({ onEscape });
		const menu = document.createElement("div");
		menu.className = "slashCommandMenu";
		document.body.append(menu);

		try {
			expect(press(harness.editor, "Escape")).toBe(false);
			expect(onEscape).not.toHaveBeenCalled();
		} finally {
			menu.remove();
			harness.destroy();
		}
	});

	it("does not call onEscape when a wiki link menu is open", () => {
		const onEscape = vi.fn();
		const harness = createEditor({ onEscape });
		const menu = document.createElement("div");
		menu.className = "wikiLinkSuggestionMenu";
		document.body.append(menu);

		try {
			expect(press(harness.editor, "Escape")).toBe(false);
			expect(onEscape).not.toHaveBeenCalled();
		} finally {
			menu.remove();
			harness.destroy();
		}
	});

	it("does not call onSave for Mod+Enter when an overlay is open", () => {
		const onSave = vi.fn();
		const harness = createEditor({ onSave });
		const menu = document.createElement("div");
		menu.className = "slashCommandMenu";
		document.body.append(menu);

		try {
			pressModEnter(harness.editor);
			expect(onSave).not.toHaveBeenCalled();
		} finally {
			menu.remove();
			harness.destroy();
		}
	});
});
