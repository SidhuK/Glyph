export const PATH_REMOVED_EVENT = "glyph:path-removed";
export const FILE_TREE_START_RENAME_EVENT = "glyph:file-tree-start-rename";
export const PATH_RENAMED_EVENT = "glyph:path-renamed";
export const OPEN_LOCAL_GRAPH_EVENT = "glyph:open-local-graph";
export const EDITOR_MENU_ACTION_EVENT = "glyph:editor-menu-action";
export const TOGGLE_NOTE_INFO_SIDEBAR_EVENT = "glyph:toggle-note-info-sidebar";

export interface PathRemovedDetail {
	path: string;
	recursive: boolean;
}

export interface FileTreeStartRenameDetail {
	path: string;
}

export interface PathRenamedDetail {
	fromPath: string;
	toPath: string;
	recursive: boolean;
}

export interface OpenLocalGraphDetail {
	path: string;
}

export interface EditorMenuActionDetail {
	action: string;
}

export interface ToggleNoteInfoSidebarDetail {
	path: string;
}

export function dispatchPathRemoved(detail: PathRemovedDetail) {
	window.dispatchEvent(
		new CustomEvent<PathRemovedDetail>(PATH_REMOVED_EVENT, { detail }),
	);
}

export function dispatchFileTreeStartRename(detail: FileTreeStartRenameDetail) {
	window.dispatchEvent(
		new CustomEvent<FileTreeStartRenameDetail>(FILE_TREE_START_RENAME_EVENT, {
			detail,
		}),
	);
}

export function dispatchPathRenamed(detail: PathRenamedDetail) {
	window.dispatchEvent(
		new CustomEvent<PathRenamedDetail>(PATH_RENAMED_EVENT, { detail }),
	);
}

export function dispatchOpenLocalGraph(detail: OpenLocalGraphDetail) {
	window.dispatchEvent(
		new CustomEvent<OpenLocalGraphDetail>(OPEN_LOCAL_GRAPH_EVENT, { detail }),
	);
}

export function dispatchEditorMenuAction(detail: EditorMenuActionDetail) {
	window.dispatchEvent(
		new CustomEvent<EditorMenuActionDetail>(EDITOR_MENU_ACTION_EVENT, {
			detail,
		}),
	);
}

export function dispatchToggleNoteInfoSidebar(
	detail: ToggleNoteInfoSidebarDetail,
) {
	window.dispatchEvent(
		new CustomEvent<ToggleNoteInfoSidebarDetail>(
			TOGGLE_NOTE_INFO_SIDEBAR_EVENT,
			{
				detail,
			},
		),
	);
}
