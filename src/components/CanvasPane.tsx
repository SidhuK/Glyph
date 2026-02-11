// Legacy compatibility types for modules that still reference canvas-shaped data.
export interface CanvasNode {
	id: string;
	type?: string | null;
	data?: Record<string, unknown> | null;
}

export interface CanvasEdge {
	id: string;
	source: string;
	target: string;
}

export interface CanvasDocLike {
	version: number;
	id: string;
	title: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export type CanvasExternalCommand = {
	id: string;
	kind: string;
	noteId?: string;
	title?: string;
};
