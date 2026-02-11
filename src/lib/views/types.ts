import type { CanvasEdge, CanvasNode } from "../tauri";

export type ViewKind = "global" | "folder" | "tag" | "search";

export type ViewRef =
	| { kind: "global" }
	| { kind: "folder"; dir: string }
	| { kind: "tag"; tag: string }
	| { kind: "search"; query: string };

export interface ViewOptions {
	recursive?: boolean;
	limit?: number;
}

export interface ViewDoc {
	schema_version: 1;
	view_id: string;
	kind: ViewKind;
	selector: string;
	title: string;
	options: ViewOptions;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}
