import type { SplitDropEdge } from "./splitEditorModel";

export type SplitEditorDragSource =
	| { kind: "file"; path: string }
	| { kind: "tab"; paneId: string; tabId: string };

export interface SplitEditorDropTarget {
	paneId: string;
	edge: SplitDropEdge | "center";
}

const DRAG_START_EVENT = "glyph:split-editor-drag-start";
const DRAG_MOVE_EVENT = "glyph:split-editor-drag-move";
const DRAG_END_EVENT = "glyph:split-editor-drag-end";

export function startSplitEditorDrag(source: SplitEditorDragSource): void {
	window.dispatchEvent(
		new CustomEvent<SplitEditorDragSource>(DRAG_START_EVENT, {
			detail: source,
		}),
	);
}

export function moveSplitEditorDrag(x: number, y: number): void {
	window.dispatchEvent(
		new CustomEvent<{ x: number; y: number }>(DRAG_MOVE_EVENT, {
			detail: { x, y },
		}),
	);
}

export function endSplitEditorDrag(source: SplitEditorDragSource): boolean {
	const event = new CustomEvent<SplitEditorDragSource>(DRAG_END_EVENT, {
		cancelable: true,
		detail: source,
	});
	return !window.dispatchEvent(event);
}

export function cancelSplitEditorDrag(): void {
	window.dispatchEvent(
		new CustomEvent<SplitEditorDragSource | undefined>(DRAG_END_EVENT, {
			detail: undefined,
		}),
	);
}

export function listenForSplitEditorDragStart(
	listener: (source: SplitEditorDragSource) => void,
): () => void {
	const handleEvent = (event: Event) => {
		const detail = (event as CustomEvent<SplitEditorDragSource>).detail;
		if (detail) listener(detail);
	};
	window.addEventListener(DRAG_START_EVENT, handleEvent);
	return () => window.removeEventListener(DRAG_START_EVENT, handleEvent);
}

export function listenForSplitEditorDragMove(
	listener: (x: number, y: number) => void,
): () => void {
	const handleEvent = (event: Event) => {
		const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
		if (detail) listener(detail.x, detail.y);
	};
	window.addEventListener(DRAG_MOVE_EVENT, handleEvent);
	return () => window.removeEventListener(DRAG_MOVE_EVENT, handleEvent);
}

export function listenForSplitEditorDragEnd(
	listener: (
		source: SplitEditorDragSource | undefined,
		event: Event,
	) => void,
): () => void {
	const handleEvent = (event: Event) => {
		listener(
			(event as CustomEvent<SplitEditorDragSource | undefined>).detail,
			event,
		);
	};
	window.addEventListener(DRAG_END_EVENT, handleEvent);
	return () => window.removeEventListener(DRAG_END_EVENT, handleEvent);
}

export function splitEditorDropTargetAtPoint(
	clientX: number,
	clientY: number,
): SplitEditorDropTarget | null {
	const element = document
		.elementsFromPoint(clientX, clientY)
		.map((candidate) =>
			candidate.closest<HTMLElement>("[data-split-editor-pane-id]"),
		)
		.find((candidate) => candidate !== null);
	const paneId = element?.dataset.splitEditorPaneId;
	if (!element || !paneId) return null;

	const rect = element.getBoundingClientRect();
	const x = (clientX - rect.left) / rect.width;
	const y = (clientY - rect.top) / rect.height;
	const edgeSize = 0.3;
	let edge: SplitEditorDropTarget["edge"] = "center";
	if (y < edgeSize) edge = "top";
	else if (y > 1 - edgeSize) edge = "bottom";
	else if (x < edgeSize) edge = "left";
	else if (x > 1 - edgeSize) edge = "right";
	return { paneId, edge };
}
