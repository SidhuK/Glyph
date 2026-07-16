export type EditorViewMode = "plain" | "rich" | "preview";

const EDITOR_VIEW_MODES = new Set<EditorViewMode>(["plain", "rich", "preview"]);

export const DEFAULT_EDITOR_VIEW_MODE: EditorViewMode = "rich";

export function isEditorViewMode(value: unknown): value is EditorViewMode {
	return (
		typeof value === "string" && EDITOR_VIEW_MODES.has(value as EditorViewMode)
	);
}

// Cached copy of the persisted `editor.defaultEditorMode` setting so note
// panes can pick their initial mode synchronously at mount. Hydrated by
// `loadSettings()` and kept fresh by `setEditorDefaultEditorMode()`.
let cachedDefaultEditorViewMode: EditorViewMode = DEFAULT_EDITOR_VIEW_MODE;

export function getDefaultEditorViewMode(): EditorViewMode {
	return cachedDefaultEditorViewMode;
}

export function setCachedDefaultEditorViewMode(mode: EditorViewMode): void {
	cachedDefaultEditorViewMode = mode;
}
