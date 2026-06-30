import type { Editor } from "@tiptap/core";
import type { TableEditorCommand } from "../noteEditorOverlayTypes";

export function runTableEditorCommand(
	editor: Editor,
	command: TableEditorCommand,
): void {
	editor.chain().focus(null, { scrollIntoView: false })[command]().run();
}
