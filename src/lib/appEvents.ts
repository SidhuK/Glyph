export const PATH_REMOVED_EVENT = "glyph:path-removed";
export const DATABASES_UPDATED_EVENT = "glyph:databases-updated";

export interface PathRemovedDetail {
	path: string;
	recursive: boolean;
}

export function dispatchPathRemoved(detail: PathRemovedDetail) {
	window.dispatchEvent(
		new CustomEvent<PathRemovedDetail>(PATH_REMOVED_EVENT, { detail }),
	);
}

export function dispatchDatabasesUpdated() {
	window.dispatchEvent(new CustomEvent(DATABASES_UPDATED_EVENT));
}
