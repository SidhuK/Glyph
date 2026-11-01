import type { Editor } from "@tiptap/core";
import { type EditorTextColor, isEditorTextColor } from "./textColors";
import { type EditorTextHighlight, isEditorTextHighlight } from "./textHighlights";

export function getActiveTextColor(editor: Editor): EditorTextColor | null {
	const color: unknown = editor.getAttributes("coloredText").color;
	return typeof color === "string" && isEditorTextColor(color) ? color : null;
}

export function getActiveTextHighlight(editor: Editor): EditorTextHighlight | null {
	const color: unknown = editor.getAttributes("highlightedText").color;
	return typeof color === "string" && isEditorTextHighlight(color) ? color : null;
}

const ACTIVE_NODES_AND_MARKS = [
	"bold",
	"italic",
	"underline",
	"strike",
	"code",
	"link",
	"paragraph",
	"bulletList",
	"orderedList",
	"taskList",
	"blockquote",
	"codeBlock",
] as const;

export function activeFormatKey(editor: Editor): string {
	if (editor.isDestroyed) return "";
	const flags = ACTIVE_NODES_AND_MARKS.map((name) => (editor.isActive(name) ? "1" : "0")).join("");
	const level: unknown = editor.isActive("heading") ? editor.getAttributes("heading").level : 0;
	return [
		flags,
		String(level),
		getActiveTextColor(editor) ?? "",
		getActiveTextHighlight(editor) ?? "",
	].join(":");
}
