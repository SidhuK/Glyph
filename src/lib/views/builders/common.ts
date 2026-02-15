import { estimateNodeSize } from "../../canvasLayout";
import { parseNotePreview, titleForFile } from "../../notePreview";
import type { CanvasEdge, CanvasNode } from "../../tauri";
import { invoke } from "../../tauri";
import { sanitizeEdges, sanitizeNodes } from "../sanitize";
import type { ViewDoc } from "../types";
import type { BuildPrimaryResult } from "./buildListViewDoc";

export function normalizeLegacyFrameChildren(
	nodes: CanvasNode[],
): CanvasNode[] {
	const legacyFrames = new Map<string, CanvasNode>();
	for (const n of nodes) {
		if (
			n.type === "frame" &&
			typeof n.id === "string" &&
			n.id.startsWith("folder:")
		)
			legacyFrames.set(n.id, n);
	}

	return nodes.map((n) => {
		const parentNode = n.parentNode ?? null;
		if (typeof parentNode !== "string") return n;
		const frame = legacyFrames.get(parentNode);
		if (!frame) return n;
		const fp = frame.position ?? { x: 0, y: 0 };
		const cp = n.position ?? { x: 0, y: 0 };
		const next: CanvasNode = {
			...n,
			position: { x: fp.x + cp.x, y: fp.y + cp.y },
		};
		next.parentNode = undefined;
		next.extent = undefined;
		return next;
	});
}

export function maxBottomForNodes(nodes: CanvasNode[]): number {
	let maxBottom = 0;
	for (const node of nodes) {
		if (!node?.position) continue;
		const size = estimateNodeSize({
			id: node.id,
			type: node.type ?? "",
			data: node.data ?? {},
		});
		const bottom = node.position.y + size.h;
		if (bottom > maxBottom) maxBottom = bottom;
	}
	return maxBottom;
}

export class NeedsIndexRebuildError extends Error {
	missingCount: number;

	constructor(message: string, missingCount: number) {
		super(message);
		this.name = "NeedsIndexRebuildError";
		this.missingCount = missingCount;
	}
}

export async function fetchNotePreviewsAllAtOnce(
	noteIds: string[],
): Promise<Map<string, { title: string; content: string }>> {
	const MAX_DISK_FILL = 50;

	if (noteIds.length === 0) return new Map();

	const resultMap = new Map<string, { title: string; content: string }>();
	let previews: Array<{ id: string; title: string; preview: string }> = [];
	try {
		previews = await invoke("index_note_previews_batch", { ids: noteIds });
	} catch (error) {
		console.warn(
			"index_note_previews_batch failed, falling back to disk",
			error,
		);
		previews = [];
	}

	for (const p of previews) {
		const id = typeof p.id === "string" ? p.id : "";
		if (!id) continue;
		const title =
			typeof p.title === "string" && p.title ? p.title : titleForFile(id);
		const content = typeof p.preview === "string" ? p.preview : "";
		resultMap.set(id, { title, content });
	}

	const missing: string[] = [];
	for (const id of noteIds) {
		if (!resultMap.has(id)) missing.push(id);
	}
	if (!missing.length) return resultMap;

	if (missing.length > MAX_DISK_FILL) {
		throw new NeedsIndexRebuildError(
			`index missing too many previews (${missing.length})`,
			missing.length,
		);
	}

	try {
		const batchResults = await invoke("vault_read_texts_batch", {
			paths: missing,
		});
		for (const doc of batchResults) {
			const rel = doc.rel_path;
			if (!rel) continue;
			if (doc.text != null) {
				resultMap.set(rel, parseNotePreview(rel, doc.text));
			} else {
				resultMap.set(rel, { title: titleForFile(rel), content: "" });
			}
		}
	} catch {
		for (const id of missing) {
			if (!resultMap.has(id))
				resultMap.set(id, { title: titleForFile(id), content: "" });
		}
	}

	return resultMap;
}

export function buildPrimaryNoteNode(
	id: string,
	prevNode: CanvasNode | undefined,
	noteData: { title: string; content: string } | undefined,
	titleOverride?: string,
): BuildPrimaryResult {
	if (prevNode) {
		if (prevNode.type === "note") {
			return {
				node: {
					...prevNode,
					data: {
						...prevNode.data,
						title:
							noteData?.title ||
							(typeof prevNode.data.title === "string"
								? prevNode.data.title
								: undefined) ||
							titleOverride ||
							titleForFile(id),
						content: noteData?.content || "",
					},
				},
				isNew: false,
			};
		}
		return { node: { ...prevNode }, isNew: false };
	}
	return {
		node: {
			id,
			type: "note",
			position: { x: 0, y: 0 },
			data: {
				noteId: id,
				title: noteData?.title || titleOverride || titleForFile(id),
				content: noteData?.content || "",
			},
		},
		isNew: true,
	};
}

function isDeepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== typeof b) return false;
	if (a == null || b == null) return false;
	if (typeof a !== "object") return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i += 1) {
			if (!isDeepEqual(a[i], b[i])) return false;
		}
		return true;
	}
	const aRecord = a as Record<string, unknown>;
	const bRecord = b as Record<string, unknown>;
	const aKeys = Object.keys(aRecord);
	const bKeys = Object.keys(bRecord);
	if (aKeys.length !== bKeys.length) return false;
	for (const key of aKeys) {
		if (!(key in bRecord)) return false;
		if (!isDeepEqual(aRecord[key], bRecord[key])) return false;
	}
	return true;
}

export function hasViewDocChanged(
	prev: ViewDoc | null,
	prevNodes: CanvasNode[],
	prevEdges: CanvasEdge[],
	nextNodes: CanvasNode[],
	nextEdges: CanvasEdge[],
): boolean {
	if (!prev) return true;

	const sanitizedPrevNodes = sanitizeNodes(prevNodes);
	const sanitizedNextNodes = sanitizeNodes(nextNodes);
	if (!isDeepEqual(sanitizedPrevNodes, sanitizedNextNodes)) return true;

	const sanitizedPrevEdges = sanitizeEdges(prevEdges);
	const sanitizedNextEdges = sanitizeEdges(nextEdges);
	return !isDeepEqual(sanitizedPrevEdges, sanitizedNextEdges);
}
