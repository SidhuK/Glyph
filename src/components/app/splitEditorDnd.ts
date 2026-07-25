import type { SplitDropEdge } from "../../lib/splitEditor";

export type SplitEditorDragSource =
	| { kind: "file"; path: string }
	| { kind: "tab"; paneId: string; tabId: string };

export interface SplitEditorDropTarget {
	paneId: string;
	edge: SplitDropEdge | "center";
}

type SplitEditorDragEvent =
	| { type: "move"; source: SplitEditorDragSource; x: number; y: number }
	| { type: "end"; source: SplitEditorDragSource | null };

type SplitEditorDragListener = (
	event: SplitEditorDragEvent,
) => boolean | undefined;

const listeners = new Set<SplitEditorDragListener>();

function publish(event: SplitEditorDragEvent): boolean {
	let handled = false;
	for (const listener of listeners) {
		handled = listener(event) === true || handled;
	}
	return handled;
}

export function subscribeToSplitEditorDrag(
	listener: SplitEditorDragListener,
): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function moveSplitEditorDrag(
	source: SplitEditorDragSource,
	x: number,
	y: number,
): void {
	publish({ type: "move", source, x, y });
}

export function endSplitEditorDrag(source: SplitEditorDragSource): boolean {
	return publish({ type: "end", source });
}

export function cancelSplitEditorDrag(): void {
	publish({ type: "end", source: null });
}
