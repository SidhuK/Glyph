export const PATH_REMOVED_EVENT = "glyph:path-removed";

export interface PathRemovedDetail {
	path: string;
	recursive: boolean;
}

export function dispatchPathRemoved(detail: PathRemovedDetail) {
	window.dispatchEvent(
		new CustomEvent<PathRemovedDetail>(PATH_REMOVED_EVENT, { detail }),
	);
}
