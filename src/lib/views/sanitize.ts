import type { CanvasEdge, CanvasNode } from "../tauri";
import type { ViewDoc } from "./types";

export function sanitizeNodes(nodes: CanvasNode[]): CanvasNode[] {
	return nodes.map((n) => {
		const base: CanvasNode = {
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data ?? {},
		};
		const parentNode = (n as unknown as { parentNode?: string | null })
			.parentNode;
		if (parentNode)
			(base as unknown as { parentNode: string }).parentNode = parentNode;
		const extent = (n as unknown as { extent?: unknown }).extent;
		if (extent != null)
			(base as unknown as { extent: unknown }).extent = extent;
		const style = (n as unknown as { style?: unknown }).style;
		if (style != null) (base as unknown as { style: unknown }).style = style;
		return base;
	});
}

export function sanitizeEdges(edges: CanvasEdge[]): CanvasEdge[] {
	return edges.map((e) => {
		const base: CanvasEdge = {
			id: e.id,
			source: e.source,
			target: e.target,
			type: e.type,
			data: e.data ?? {},
		};
		const label = (e as unknown as { label?: unknown }).label;
		if (label != null) (base as unknown as { label: unknown }).label = label;
		const style = (e as unknown as { style?: unknown }).style;
		if (style != null) (base as unknown as { style: unknown }).style = style;
		return base;
	});
}

export function asCanvasDocLike(doc: ViewDoc): {
	version: number;
	id: string;
	title: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
} {
	return {
		version: 1,
		id: doc.view_id,
		title: doc.title,
		nodes: doc.nodes,
		edges: doc.edges,
	};
}
