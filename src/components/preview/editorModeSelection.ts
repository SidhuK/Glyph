import type { NoteInlineEditorMode } from "../editor/types";

const LARGE_NOTE_RICH_EDITOR_LIMIT = 100_000;

export function requiresPlainEditorMode(markdown: string): boolean {
	return markdown.length >= LARGE_NOTE_RICH_EDITOR_LIMIT;
}

export function initialEditorMode(markdown: string): NoteInlineEditorMode {
	return requiresPlainEditorMode(markdown) ? "plain" : "rich";
}
