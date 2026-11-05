import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { displayNameFromPath, isMarkdownPath, normalizeRelPath, parentDir } from "../utils/path";

export const EMPTY_EXCALIDRAW_DOCUMENT = `${JSON.stringify(
	{
		type: "excalidraw",
		version: 2,
		source: "glyph",
		elements: [],
		appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
		files: {},
	},
	null,
	2,
)}\n`;

export const EXCALIDRAW_DOCUMENT_QUERY_ROOT = ["excalidraw-document"] as const;

export function excalidrawDocumentQueryKey(spacePath: string | null, relPath: string) {
	return [...EXCALIDRAW_DOCUMENT_QUERY_ROOT, spacePath, relPath] as const;
}

interface GlyphNoteCardData {
	kind: "glyph-note";
	path: string;
	version: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function notePathFromExcalidrawElement(element: ExcalidrawElement): string | null {
	const customData: unknown = element.customData;
	if (!isRecord(customData) || !isRecord(customData.glyph)) return null;
	const glyph = customData.glyph;
	if (glyph.kind !== "glyph-note" || typeof glyph.path !== "string") return null;
	const path = normalizeRelPath(glyph.path);
	if (!path || path.split("/").includes("..") || !isMarkdownPath(path)) return null;
	return path;
}

export function noteCardSkeleton(path: string, x: number, y: number): ExcalidrawElementSkeleton {
	const folder = parentDir(path);
	const label = folder ? `${displayNameFromPath(path)}\n${folder}` : displayNameFromPath(path);
	const glyph = { kind: "glyph-note", path, version: 1 } satisfies GlyphNoteCardData;
	return {
		type: "rectangle",
		x,
		y,
		width: 280,
		height: 112,
		backgroundColor: "#dbeafe",
		fillStyle: "solid",
		strokeColor: "#2563eb",
		roughness: 1,
		roundness: { type: 3 },
		link: `/${encodeURI(path)}`,
		customData: { glyph },
		label: {
			text: label,
			fontSize: 18,
			textAlign: "center",
			verticalAlign: "middle",
		},
	};
}

interface AgentCanvasNode {
	id: string;
	label: string;
	notePath: string | null;
	x: number;
	y: number;
}

interface AgentCanvasEdge {
	from: string;
	to: string;
	label: string | null;
}

function parseAgentCanvasNode(value: unknown): AgentCanvasNode | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.label !== "string" ||
		(value.notePath !== null && typeof value.notePath !== "string") ||
		typeof value.x !== "number" ||
		typeof value.y !== "number" ||
		!Number.isFinite(value.x) ||
		!Number.isFinite(value.y)
	) {
		return null;
	}
	const notePath = value.notePath === null ? null : normalizeRelPath(value.notePath);
	if (
		notePath !== null &&
		(!notePath || notePath.split("/").includes("..") || !isMarkdownPath(notePath))
	) {
		return null;
	}
	return {
		id: value.id,
		label: value.label,
		notePath,
		x: value.x,
		y: value.y,
	};
}

function parseAgentCanvasEdge(value: unknown): AgentCanvasEdge | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.from !== "string" ||
		typeof value.to !== "string" ||
		(value.label !== null && typeof value.label !== "string")
	) {
		return null;
	}
	return { from: value.from, to: value.to, label: value.label };
}

/** The file has a `glyphCanvas` block that Glyph cannot expand without dropping parts of it. */
export class InvalidAgentCanvasError extends Error {
	constructor() {
		super("Invalid glyphCanvas data");
		this.name = "InvalidAgentCanvasError";
	}
}

/**
 * Expands the compact agent format. Returns null when the file is not in that format and
 * throws when it is but some node or edge is invalid: the first autosave rewrites the file
 * as full Excalidraw JSON, so loading a partial scene would delete the invalid parts.
 */
export function agentCanvasSkeletons(text: string): ExcalidrawElementSkeleton[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || !("glyphCanvas" in parsed)) return null;
	const canvas = parsed.glyphCanvas;
	if (
		!isRecord(canvas) ||
		canvas.version !== 1 ||
		!Array.isArray(canvas.nodes) ||
		!Array.isArray(canvas.edges)
	) {
		throw new InvalidAgentCanvasError();
	}
	const nodes = canvas.nodes.map(parseAgentCanvasNode);
	const edges = canvas.edges.map(parseAgentCanvasEdge);
	const validNodes = nodes.filter((node): node is AgentCanvasNode => node !== null);
	const validEdges = edges.filter((edge): edge is AgentCanvasEdge => edge !== null);
	const nodeIds = new Set(validNodes.map((node) => node.id));
	if (
		validNodes.length !== nodes.length ||
		validEdges.length !== edges.length ||
		nodeIds.size !== validNodes.length ||
		validEdges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))
	) {
		throw new InvalidAgentCanvasError();
	}

	const nodeSkeletons = validNodes.map((node): ExcalidrawElementSkeleton => {
		const noteData = node.notePath
			? ({ kind: "glyph-note", path: node.notePath, version: 1 } satisfies GlyphNoteCardData)
			: null;
		return {
			type: "rectangle",
			id: node.id,
			x: node.x,
			y: node.y,
			width: 280,
			height: 112,
			backgroundColor: noteData ? "#dbeafe" : "#fef3c7",
			fillStyle: "solid",
			strokeColor: noteData ? "#2563eb" : "#d97706",
			roundness: { type: 3 },
			link: node.notePath ? `/${encodeURI(node.notePath)}` : null,
			customData: noteData ? { glyph: noteData } : undefined,
			label: { text: node.label, fontSize: 18, textAlign: "center", verticalAlign: "middle" },
		};
	});
	const edgeSkeletons = validEdges.map((edge): ExcalidrawElementSkeleton => ({
		type: "arrow",
		x: 0,
		y: 0,
		start: { id: edge.from },
		end: { id: edge.to },
		label: edge.label ? { text: edge.label, fontSize: 16 } : undefined,
	}));
	return [...edgeSkeletons, ...nodeSkeletons];
}
