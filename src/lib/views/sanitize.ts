import type { CanvasEdge, CanvasNode } from "../tauri";
import type { ViewDoc } from "./types";

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

export function sanitizeNodes(nodes: CanvasNode[]): CanvasNode[] {
	return nodes.map((n) => {
		const base: CanvasNode = {
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data ?? {},
		};
		if (n.parentNode) base.parentNode = n.parentNode;
		if (n.extent != null) base.extent = n.extent;
		if (n.style != null) base.style = n.style;
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
		if (e.label != null) base.label = e.label;
		if (e.style != null) base.style = e.style;
		return base;
	});
}
