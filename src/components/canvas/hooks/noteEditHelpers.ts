import type { CanvasNode } from "../types";

interface NotePreviewData {
	title: string;
	content: string;
}

export function withUpdatedNoteNodeData(
	nodes: CanvasNode[],
	nodeId: string,
	noteId: string,
	preview: NotePreviewData,
	mtimeMs?: number,
): CanvasNode[] {
	return nodes.map((n) =>
		n.id === nodeId
			? {
					...n,
					data: {
						...(n.data ?? {}),
						noteId,
						title: preview.title,
						content: preview.content,
						...(typeof mtimeMs === "number" ? { mtimeMs } : {}),
					},
				}
			: n,
	);
}
