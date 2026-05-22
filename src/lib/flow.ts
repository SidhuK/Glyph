import type { Edge, Node, Viewport } from "@xyflow/react";

export const FLOW_SCHEMA_VERSION = 1;

export interface GlyphFlowExtension {
	schemaVersion: 1;
	nodeGroups?: Record<string, string>;
	nodeModes?: Record<string, "preview" | "compact" | "full">;
}

export interface FlowViewport {
	x: number;
	y: number;
	zoom: number;
}

export type FlowColor = string;
export type FlowNodeType = "text" | "file" | "link" | "group";
export type FlowGlyphNodeKind =
	| "text"
	| "sticky"
	| "note"
	| "file"
	| "link"
	| "group";

export interface FlowDocumentNodeBase {
	id: string;
	type: FlowNodeType;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: FlowColor;
	glyph?: {
		groupId?: string;
		mode?: "preview" | "compact" | "full";
		kind?: FlowGlyphNodeKind;
		rotation?: number;
	};
}

export interface FlowTextNode extends FlowDocumentNodeBase {
	type: "text";
	text: string;
}

export interface FlowFileNode extends FlowDocumentNodeBase {
	type: "file";
	file: string;
	subpath?: string;
}

export interface FlowLinkNode extends FlowDocumentNodeBase {
	type: "link";
	url: string;
}

export interface FlowGroupNode extends FlowDocumentNodeBase {
	type: "group";
	label?: string;
	background?: string;
	backgroundStyle?: "cover" | "ratio" | "repeat";
}

export type FlowDocumentNode =
	| FlowTextNode
	| FlowFileNode
	| FlowLinkNode
	| FlowGroupNode;

export interface FlowDocumentEdge {
	id: string;
	fromNode: string;
	fromSide?: "top" | "right" | "bottom" | "left";
	fromEnd?: "none" | "arrow";
	toNode: string;
	toSide?: "top" | "right" | "bottom" | "left";
	toEnd?: "none" | "arrow";
	color?: FlowColor;
	label?: string;
}

export interface FlowDocument {
	version: 1;
	nodes: FlowDocumentNode[];
	edges: FlowDocumentEdge[];
	viewport?: FlowViewport;
	glyph?: GlyphFlowExtension;
}

export type FlowNodeData =
	| {
			flowType: "text";
			text: string;
			color?: string;
			glyphKind?: "text" | "sticky";
			rotation?: number;
	  }
	| {
			flowType: "file";
			file: string;
			subpath?: string;
			color?: string;
			glyphKind?: "note" | "file";
			rotation?: number;
	  }
	| {
			flowType: "link";
			url: string;
			color?: string;
			glyphKind?: "link";
			rotation?: number;
	  }
	| {
			flowType: "group";
			label?: string;
			color?: string;
			glyphKind?: "group";
			rotation?: number;
	  };

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<Record<string, never>>;

const DEFAULT_VIEWPORT: FlowViewport = { x: 0, y: 0, zoom: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function normalizeNodeGlyph(
	value: unknown,
): FlowDocumentNodeBase["glyph"] | undefined {
	if (!isRecord(value)) return undefined;
	const mode =
		value.mode === "compact" ||
		value.mode === "full" ||
		value.mode === "preview"
			? value.mode
			: undefined;
	return {
		groupId: asString(value.groupId),
		mode,
		kind: normalizeNodeKind(value.kind),
		rotation: normalizeRotation(value.rotation),
	};
}

function normalizeRotation(value: unknown): number | undefined {
	const rotation = asNumber(value);
	if (rotation === undefined) return undefined;
	return ((rotation % 360) + 360) % 360;
}

function normalizeNodeKind(value: unknown): FlowGlyphNodeKind | undefined {
	if (
		value === "text" ||
		value === "sticky" ||
		value === "note" ||
		value === "file" ||
		value === "link" ||
		value === "group"
	) {
		return value;
	}
	return undefined;
}

function normalizeNode(raw: unknown): FlowDocumentNode | null {
	if (!isRecord(raw)) return null;
	const id = asString(raw.id);
	const type = asString(raw.type);
	const x = asNumber(raw.x);
	const y = asNumber(raw.y);
	const width = asNumber(raw.width);
	const height = asNumber(raw.height);
	if (!id || !type || x === undefined || y === undefined) return null;

	const base = {
		id,
		x,
		y,
		width: width ?? 280,
		height: height ?? 180,
		color: asString(raw.color),
		glyph: normalizeNodeGlyph(raw.glyph),
	};

	if (type === "text") {
		return { ...base, type, text: asString(raw.text) ?? "" };
	}
	if (type === "file") {
		const file = asString(raw.file);
		if (!file) return null;
		return { ...base, type, file, subpath: asString(raw.subpath) };
	}
	if (type === "link") {
		const url = asString(raw.url);
		if (!url) return null;
		return { ...base, type, url };
	}
	if (type === "group") {
		return {
			...base,
			type,
			label: asString(raw.label),
			background: asString(raw.background),
			backgroundStyle:
				raw.backgroundStyle === "cover" ||
				raw.backgroundStyle === "ratio" ||
				raw.backgroundStyle === "repeat"
					? raw.backgroundStyle
					: undefined,
		};
	}
	return null;
}

function normalizeEdge(raw: unknown): FlowDocumentEdge | null {
	if (!isRecord(raw)) return null;
	const id = asString(raw.id);
	const fromNode = asString(raw.fromNode);
	const toNode = asString(raw.toNode);
	if (!id || !fromNode || !toNode) return null;
	return {
		id,
		fromNode,
		toNode,
		fromSide: sideFromHandle(asString(raw.fromSide)),
		toSide: sideFromHandle(asString(raw.toSide)),
		fromEnd: raw.fromEnd === "arrow" ? "arrow" : "none",
		toEnd: raw.toEnd === "none" ? "none" : "arrow",
		color: asString(raw.color),
		label: asString(raw.label),
	};
}

export function createEmptyFlowDocument(): FlowDocument {
	return {
		version: FLOW_SCHEMA_VERSION,
		nodes: [],
		edges: [],
		viewport: DEFAULT_VIEWPORT,
		glyph: { schemaVersion: FLOW_SCHEMA_VERSION },
	};
}

export function serializeFlowDocument(document: FlowDocument): string {
	return `${JSON.stringify(document, null, "\t")}\n`;
}

export function parseFlowDocument(text: string): FlowDocument {
	const fallback = createEmptyFlowDocument();
	if (!text.trim()) return fallback;
	const raw = JSON.parse(text) as unknown;
	if (!isRecord(raw)) return fallback;
	const nodes = Array.isArray(raw.nodes)
		? raw.nodes
				.map(normalizeNode)
				.filter((node): node is FlowDocumentNode => Boolean(node))
		: [];
	const edges = Array.isArray(raw.edges)
		? raw.edges
				.map(normalizeEdge)
				.filter((edge): edge is FlowDocumentEdge => Boolean(edge))
		: [];
	const viewport = isRecord(raw.viewport)
		? {
				x: asNumber(raw.viewport.x) ?? DEFAULT_VIEWPORT.x,
				y: asNumber(raw.viewport.y) ?? DEFAULT_VIEWPORT.y,
				zoom: asNumber(raw.viewport.zoom) ?? DEFAULT_VIEWPORT.zoom,
			}
		: DEFAULT_VIEWPORT;
	return {
		version: FLOW_SCHEMA_VERSION,
		nodes,
		edges,
		viewport,
		glyph: { schemaVersion: FLOW_SCHEMA_VERSION },
	};
}

export function flowDocumentToReactFlow(document: FlowDocument): {
	nodes: FlowNode[];
	edges: FlowEdge[];
	viewport: Viewport;
} {
	const nodes = document.nodes.map((node) => {
		const parentId = node.glyph?.groupId;
		const base = {
			id: node.id,
			position: { x: node.x, y: node.y },
			width: node.width,
			height: node.height,
			style: { width: node.width, height: node.height },
			parentId,
			extent: parentId ? ("parent" as const) : undefined,
		};
		if (node.type === "text") {
			return {
				...base,
				type: "flowText",
				data: {
					flowType: "text",
					text: node.text,
					color: node.color,
					glyphKind:
						node.glyph?.kind === "sticky" || node.glyph?.kind === "text"
							? node.glyph.kind
							: "text",
					rotation: node.glyph?.rotation,
				},
			} satisfies FlowNode;
		}
		if (node.type === "file") {
			return {
				...base,
				type: "flowFile",
				data: {
					flowType: "file",
					file: node.file,
					subpath: node.subpath,
					color: node.color,
					glyphKind:
						node.glyph?.kind === "file" || node.glyph?.kind === "note"
							? node.glyph.kind
							: node.file.toLowerCase().endsWith(".md")
								? "note"
								: "file",
					rotation: node.glyph?.rotation,
				},
			} satisfies FlowNode;
		}
		if (node.type === "link") {
			return {
				...base,
				type: "flowLink",
				data: {
					flowType: "link",
					url: node.url,
					color: node.color,
					glyphKind: "link",
					rotation: node.glyph?.rotation,
				},
			} satisfies FlowNode;
		}
		return {
			...base,
			type: "flowGroup",
			data: {
				flowType: "group",
				label: node.label,
				color: node.color,
				glyphKind: "group",
				rotation: node.glyph?.rotation,
			},
			zIndex: -1,
		} satisfies FlowNode;
	});

	const edges = document.edges.map((edge) => ({
		id: edge.id,
		source: edge.fromNode,
		target: edge.toNode,
		sourceHandle: edge.fromSide,
		targetHandle: edge.toSide,
		label: edge.label,
		animated: false,
		style: edge.color ? { stroke: edge.color } : undefined,
		markerEnd:
			edge.toEnd === "none" ? undefined : { type: "arrowclosed" as const },
	})) satisfies FlowEdge[];

	return {
		nodes,
		edges,
		viewport: document.viewport ?? DEFAULT_VIEWPORT,
	};
}

export function reactFlowToFlowDocument(args: {
	nodes: FlowNode[];
	edges: FlowEdge[];
	viewport: Viewport;
}): FlowDocument {
	const nodes = args.nodes.map((node) => {
		const base = {
			id: node.id,
			x: Math.round(node.position.x),
			y: Math.round(node.position.y),
			width: Math.round(
				typeof node.measured?.width === "number"
					? node.measured.width
					: Number(node.style?.width) || node.width || 280,
			),
			height: Math.round(
				typeof node.measured?.height === "number"
					? node.measured.height
					: Number(node.style?.height) || node.height || 180,
			),
			color: node.data.color,
			glyph:
				node.parentId || node.data.glyphKind || node.data.rotation
					? {
							groupId: node.parentId,
							kind: node.data.glyphKind,
							rotation: node.data.rotation,
						}
					: undefined,
		};
		if (node.data.flowType === "text") {
			return {
				...base,
				type: "text",
				text: node.data.text,
			} satisfies FlowTextNode;
		}
		if (node.data.flowType === "file") {
			return {
				...base,
				type: "file",
				file: node.data.file,
				subpath: node.data.subpath,
			} satisfies FlowFileNode;
		}
		if (node.data.flowType === "link") {
			return {
				...base,
				type: "link",
				url: node.data.url,
			} satisfies FlowLinkNode;
		}
		return {
			...base,
			type: "group",
			label: node.data.label,
		} satisfies FlowGroupNode;
	});

	const edges = args.edges.map((edge) => ({
		id: edge.id,
		fromNode: edge.source,
		toNode: edge.target,
		fromSide: sideFromHandle(edge.sourceHandle ?? undefined),
		toSide: sideFromHandle(edge.targetHandle ?? undefined),
		toEnd: edge.markerEnd ? "arrow" : "none",
		label: typeof edge.label === "string" ? edge.label : undefined,
		color:
			typeof edge.style?.stroke === "string" ? edge.style.stroke : undefined,
	})) satisfies FlowDocumentEdge[];

	return {
		version: FLOW_SCHEMA_VERSION,
		nodes,
		edges,
		viewport: {
			x: args.viewport.x,
			y: args.viewport.y,
			zoom: args.viewport.zoom,
		},
		glyph: { schemaVersion: FLOW_SCHEMA_VERSION },
	};
}

export function sideFromHandle(
	handle: string | null | undefined,
): "top" | "right" | "bottom" | "left" | undefined {
	if (
		handle === "top" ||
		handle === "right" ||
		handle === "bottom" ||
		handle === "left"
	) {
		return handle;
	}
	return undefined;
}

export function nextFlowNodeId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}
