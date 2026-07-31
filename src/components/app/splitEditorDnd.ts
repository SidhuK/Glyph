import type { SplitDropEdge } from "../../lib/splitEditor";
import { isMarkdownPath } from "../../utils/path";
import { FILE_TREE_ENTRY_TYPE } from "../filetree/fileTreeDnd";

/** Draggable type for editor tabs, shared so pane droppables can accept them. */
export const MAIN_TAB_DND_TYPE = "main-tab";

/**
 * Matches `CollisionPriority.Lowest` in @dnd-kit/abstract. Panes span the whole
 * editor area, so they must only win a collision when no tab strip or file tree
 * row is under the pointer.
 */
const SPLIT_PANE_COLLISION_PRIORITY = 0;

export type SplitEditorDragSource =
	| { kind: "file"; path: string }
	| { kind: "tab"; paneId: string; tabId: string };

export interface SplitEditorDropTarget {
	paneId: string;
	edge: SplitDropEdge | "center";
}

/** Droppable config for an editor pane. */
export function splitPaneDroppable(paneId: string) {
	return {
		id: `split-pane:${paneId}`,
		data: { splitPaneId: paneId },
		accept: [MAIN_TAB_DND_TYPE, FILE_TREE_ENTRY_TYPE],
		collisionPriority: SPLIT_PANE_COLLISION_PRIORITY,
	};
}

/**
 * Pane id for a drop target, or null when the target is not a pane. Tab
 * sortables also carry a `paneId`, so panes are keyed separately to keep the
 * two apart.
 */
export function splitPaneIdOf(
	data: Record<string, unknown> | undefined,
): string | null {
	const paneId = data?.splitPaneId;
	return typeof paneId === "string" ? paneId : null;
}

/**
 * The single place that decides what may be dropped into an editor pane.
 * Returns null for anything else, including folders and non-markdown files.
 */
export function resolveSplitDragSource(
	data: Record<string, unknown> | undefined,
): SplitEditorDragSource | null {
	if (!data) return null;
	const { tabId, paneId, path, kind } = data;
	if (typeof tabId === "string" && typeof paneId === "string") {
		return { kind: "tab", paneId, tabId };
	}
	if (kind === "file" && typeof path === "string" && isMarkdownPath(path)) {
		return { kind: "file", path };
	}
	return null;
}
