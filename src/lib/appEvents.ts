export const PATH_REMOVED_EVENT = "glyph:path-removed";
export const FILE_TREE_START_RENAME_EVENT = "glyph:file-tree-start-rename";
export const PATH_RENAMED_EVENT = "glyph:path-renamed";

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
