export type { ViewDoc, ViewKind, ViewOptions, ViewRef } from "./views/types";

export { basename, sha256Hex, viewDocPath, viewId } from "./views/utils";

export {
	asCanvasDocLike,
	sanitizeEdges,
	sanitizeNodes,
} from "./views/sanitize";

export { loadViewDoc, saveViewDoc } from "./views/persistence";

export {
	NeedsIndexRebuildError,
	hasViewDocChanged,
	maxBottomForNodes,
} from "./views/builders/common";

export {
	type BuildListViewDocParams,
	type BuildPrimaryResult,
	buildListViewDoc,
} from "./views/builders/buildListViewDoc";
export { buildFolderViewDoc } from "./views/builders/folderView";
export { buildSearchViewDoc } from "./views/builders/searchView";
export { buildTagViewDoc } from "./views/builders/tagView";
