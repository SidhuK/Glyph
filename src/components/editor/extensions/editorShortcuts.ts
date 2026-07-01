import { Extension } from "@tiptap/core";
import { isEditorOverlayOpen } from "../editorOverlays";

export interface EditorShortcutsHandlers {
	onEscape?: () => void;
	onSave?: () => void;
}

export function createEditorShortcutsExtension(
	getHandlers: () => EditorShortcutsHandlers,
) {
	return Extension.create({
		name: "editorShortcuts",
		priority: 1000,
		addKeyboardShortcuts() {
			return {
				Escape: () => {
					const { onEscape } = getHandlers();
					if (!onEscape || isEditorOverlayOpen()) return false;
					onEscape();
					return true;
				},
				"Mod-Enter": () => {
					const { onSave } = getHandlers();
					if (!onSave || isEditorOverlayOpen()) return false;
					onSave();
					return true;
				},
			};
		},
	});
}
