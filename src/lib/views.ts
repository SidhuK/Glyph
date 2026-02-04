import {
	GRID_GAP,
	computeGridPositions,
	estimateNodeSize,
	snapPoint,
} from "./canvasLayout";
import { parseNotePreview, titleForFile } from "./notePreview";
import type { CanvasEdge, CanvasNode, FsEntry } from "./tauri";
import { invoke } from "./tauri";

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

function basename(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

function viewId(view: ViewRef): {
	id: string;
	kind: ViewKind;
	selector: string;
	title: string;
} {
	switch (view.kind) {
		case "global":
			return { id: "global", kind: "global", selector: "", title: "Vault" };
		case "folder": {
			const dir = view.dir
				.trim()
				.replace(/\\/g, "/")
				.replace(/^\/+|\/+$/g, "");
			const title = dir ? basename(dir) : "Vault";
			return { id: `folder:${dir}`, kind: "folder", selector: dir, title };
		}
		case "tag":
			return {
				id: `tag:${view.tag}`,
				kind: "tag",
				selector: view.tag,
				title: view.tag.startsWith("#") ? view.tag : `#${view.tag}`,
			};
		case "search":
			return {
				id: `search:${view.query}`,
				kind: "search",
				selector: view.query,
				title: "Search",
			};
	}
}

async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function viewDocPath(view: ViewRef): Promise<string> {
	const v = viewId(view);
	if (v.kind === "global") return "views/global.json";
	const hash = await sha256Hex(v.id);
	return `views/${v.kind}/${hash}.json`;
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

function tryParseViewDoc(raw: string): ViewDoc | null {
	try {
		const parsed = JSON.parse(raw) as ViewDoc;
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.schema_version !== 1) return null;
		if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
			return null;
		return parsed;
	} catch {
		return null;
	}
}

export async function loadViewDoc(
	view: ViewRef,
): Promise<{ doc: ViewDoc | null; path: string }> {
	const path = await viewDocPath(view);
	try {
		const raw = await invoke("tether_read_text", { path });
		return { doc: tryParseViewDoc(raw), path };
	} catch {
		return { doc: null, path };
	}
}

export async function saveViewDoc(path: string, doc: ViewDoc): Promise<void> {
	const stable: ViewDoc = {
		...doc,
		nodes: sanitizeNodes(doc.nodes),
		edges: sanitizeEdges(doc.edges),
	};
	await invoke("tether_write_text", {
		path,
		text: JSON.stringify(stable, null, 2),
	});
}

function maxBottomForNodes(nodes: CanvasNode[]): number {
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

async function fetchNotePreviewsAllAtOnce(
	noteIds: string[],
): Promise<Map<string, { title: string; content: string }>> {
	const MAX_DISK_FILL = 50;

	if (noteIds.length === 0) return new Map();

	const resultMap = new Map<string, { title: string; content: string }>();
	let previews: Array<{ id: string; title: string; preview: string }> = [];
	try {
		previews = await invoke("index_note_previews_batch", { ids: noteIds });
	} catch {
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

	// Fill small gaps from disk (new/unindexed files) without waiting for a full rebuild.
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

export async function buildFolderViewDoc(
	dir: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "folder", dir });
	// Folder views are non-recursive by default: show root files only; hierarchy is handled in the UI.
	const recursive = options.recursive ?? false;
	const limit = options.limit ?? 500;

	const entries = await invoke("vault_list_dir", {
		dir: v.selector || null,
	});

	const recent = await invoke("vault_dir_recent_entries", {
		dir: v.selector || null,
		limit: 5,
	});
	const recentIds = new Set(recent.map((r) => r.rel_path));

	const fileByRel = new Map(
		(entries as FsEntry[])
			.filter((e) => e.kind === "file")
			.map((e) => [e.rel_path, e] as const),
	);
	if (recursive) {
		const recursiveNotes = await invoke("vault_list_markdown_files", {
			dir: v.selector || null,
			recursive: true,
			limit,
		});
		for (const e of recursiveNotes as FsEntry[]) {
			if (!e?.rel_path) continue;
			if (fileByRel.has(e.rel_path)) continue;
			fileByRel.set(e.rel_path, e);
		}
	}

	const alpha: FsEntry[] = [...fileByRel.values()]
		.sort((a, b) =>
			a.rel_path.toLowerCase().localeCompare(b.rel_path.toLowerCase()),
		)
		.slice(0, limit);
	const included = new Set(alpha.map((e) => e.rel_path));

	for (const rel of recentIds) {
		const e = fileByRel.get(rel);
		if (!e) continue;
		if (included.has(rel)) continue;
		alpha.push(e);
		included.add(rel);
	}

	const rootFiles = alpha.sort((a, b) =>
		a.rel_path.toLowerCase().localeCompare(b.rel_path.toLowerCase()),
	);

	const mdRoot = rootFiles.filter((f) => f.is_markdown).map((f) => f.rel_path);
	const noteContents = await fetchNotePreviewsAllAtOnce(mdRoot);

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];

	// Legacy folder views auto-generated a `frame` per folder group (id starts with "folder:").
	// When we transition away from frames, flatten any children to absolute positions.
	const legacyFrames = new Map<string, CanvasNode>();
	for (const n of prevNodes) {
		if (
			n.type === "frame" &&
			typeof n.id === "string" &&
			n.id.startsWith("folder:")
		)
			legacyFrames.set(n.id, n);
	}

	const normalizedPrevNodes: CanvasNode[] = prevNodes.map((n) => {
		const parentNode =
			(n as unknown as { parentNode?: unknown }).parentNode ?? null;
		if (typeof parentNode !== "string") return n;
		const frame = legacyFrames.get(parentNode);
		if (!frame) return n;
		const fp = frame.position ?? { x: 0, y: 0 };
		const cp = n.position ?? { x: 0, y: 0 };
		const next: CanvasNode = {
			...n,
			position: { x: fp.x + cp.x, y: fp.y + cp.y },
		};
		// Remove parenting metadata that will otherwise orphan the node.
		(next as unknown as { parentNode?: string }).parentNode = undefined;
		(next as unknown as { extent?: unknown }).extent = undefined;
		return next;
	});

	const prevById = new Map(normalizedPrevNodes.map((n) => [n.id, n] as const));
	const nextNodes: CanvasNode[] = [];
	const newNodes: CanvasNode[] = [];

	// Root files only (notes + non-markdown files)
	for (let i = 0; i < rootFiles.length; i++) {
		const f = rootFiles[i];
		if (!f) continue;
		const relPath = f.rel_path;
		const existingNode = prevById.get(relPath);
		if (existingNode) {
			if (existingNode.type === "note") {
				const noteData = noteContents.get(relPath);
				nextNodes.push({
					...existingNode,
					position: snapPoint(existingNode.position ?? { x: 0, y: 0 }),
					data: {
						...existingNode.data,
						title:
							noteData?.title ||
							(existingNode.data as { title?: string }).title ||
							titleForFile(relPath),
						content: noteData?.content || "",
					},
				});
			} else {
				nextNodes.push({
					...existingNode,
					position: snapPoint(existingNode.position ?? { x: 0, y: 0 }),
				});
			}
			continue;
		}

		const isMarkdown = Boolean(f.is_markdown);
		const noteData = isMarkdown ? noteContents.get(relPath) : null;
		const node: CanvasNode = {
			id: relPath,
			type: isMarkdown ? "note" : "file",
			position: { x: 0, y: 0 },
			data: isMarkdown
				? {
						noteId: relPath,
						title: noteData?.title || titleForFile(relPath),
						content: noteData?.content || "",
					}
				: { path: relPath, title: basename(relPath) },
		};
		nextNodes.push(node);
		newNodes.push(node);
	}

	// Preserve non-derived nodes (text/link/user frames/etc.)
	for (const n of normalizedPrevNodes) {
		if (
			n.type === "note" ||
			n.type === "file" ||
			n.type === "folder" ||
			n.type === "folder_preview"
		)
			continue;
		if (
			n.type === "frame" &&
			typeof n.id === "string" &&
			n.id.startsWith("folder:")
		)
			continue;
		nextNodes.push({
			...n,
			position: snapPoint(n.position ?? { x: 0, y: 0 }),
		});
	}

	if (newNodes.length > 0) {
		const shouldLayoutAll = !prev || prevNodes.length === 0;
		const baseNodes = shouldLayoutAll ? nextNodes : newNodes;
		const startY = shouldLayoutAll
			? 0
			: maxBottomForNodes(nextNodes) + GRID_GAP * 2;
		const positions = computeGridPositions(
			baseNodes.map((n) => ({
				id: n.id,
				type: n.type ?? "",
				data: n.data ?? {},
			})),
			{ startX: 0, startY },
		);
		for (const node of baseNodes) {
			const pos = positions.get(node.id);
			if (pos) node.position = pos;
		}
	}

	const nextIds = new Set(nextNodes.map((n) => n.id));
	const nextEdges = prevEdges.filter(
		(e) => nextIds.has(e.source) && nextIds.has(e.target),
	);

	const doc: ViewDoc = {
		schema_version: 1,
		view_id: v.id,
		kind: "folder",
		selector: v.selector,
		title: v.title,
		options: { recursive, limit },
		nodes: nextNodes,
		edges: nextEdges,
	};

	const changed =
		!prev ||
		JSON.stringify(sanitizeNodes(prevNodes)) !==
			JSON.stringify(sanitizeNodes(nextNodes)) ||
		JSON.stringify(sanitizeEdges(prevEdges)) !==
			JSON.stringify(sanitizeEdges(nextEdges));

	return { doc, changed };
}

export async function buildSearchViewDoc(
	query: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "search", query });
	const limit = options.limit ?? 200;
	const results = await invoke("search", { query: v.selector });

	const ids = (results ?? [])
		.map((r) => r.id)
		.filter(Boolean)
		.slice(0, limit);

	// Fetch content for all notes (prefer index; fill small gaps from disk)
	const noteContents = await fetchNotePreviewsAllAtOnce(ids);

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];
	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));
	const titleById = new Map(
		(results ?? []).map((r) => [r.id, r.title] as const),
	);

	const nextNodes: CanvasNode[] = [];
	const newNodes: CanvasNode[] = [];
	for (let i = 0; i < ids.length; i++) {
		const relPath = ids[i] as string;
		const existingNode = prevById.get(relPath);
		const noteData = noteContents.get(relPath);
		if (existingNode) {
			// Update content for existing note nodes
			if (existingNode.type === "note") {
				nextNodes.push({
					...existingNode,
					position: snapPoint(existingNode.position ?? { x: 0, y: 0 }),
					data: {
						...existingNode.data,
						title:
							noteData?.title ||
							(existingNode.data as { title?: string }).title ||
							titleForFile(relPath),
						content: noteData?.content || "",
					},
				});
			} else {
				nextNodes.push({
					...existingNode,
					position: snapPoint(existingNode.position ?? { x: 0, y: 0 }),
				});
			}
			continue;
		}
		const node: CanvasNode = {
			id: relPath,
			type: "note",
			position: { x: 0, y: 0 },
			data: {
				noteId: relPath,
				title:
					noteData?.title || titleById.get(relPath) || titleForFile(relPath),
				content: noteData?.content || "",
			},
		};
		nextNodes.push(node);
		newNodes.push(node);
	}

	for (const n of prevNodes) {
		if (n.type === "note") continue;
		nextNodes.push({
			...n,
			position: snapPoint(n.position ?? { x: 0, y: 0 }),
		});
	}

	if (newNodes.length > 0) {
		const shouldLayoutAll = !prev || prevNodes.length === 0;
		const baseNodes = shouldLayoutAll ? nextNodes : newNodes;
		const startY = shouldLayoutAll
			? 0
			: maxBottomForNodes(nextNodes) + GRID_GAP * 2;
		const positions = computeGridPositions(
			baseNodes.map((n) => ({
				id: n.id,
				type: n.type ?? "",
				data: n.data ?? {},
			})),
			{ startX: 0, startY },
		);
		for (const node of baseNodes) {
			const pos = positions.get(node.id);
			if (pos) node.position = pos;
		}
	}

	const nextIds = new Set(nextNodes.map((n) => n.id));
	const nextEdges = prevEdges.filter(
		(e) => nextIds.has(e.source) && nextIds.has(e.target),
	);

	const doc: ViewDoc = {
		schema_version: 1,
		view_id: v.id,
		kind: "search",
		selector: v.selector,
		title: `Search: ${v.selector}`.trim(),
		options: { limit },
		nodes: nextNodes,
		edges: nextEdges,
	};

	const changed =
		!prev ||
		JSON.stringify(sanitizeNodes(prevNodes)) !==
			JSON.stringify(sanitizeNodes(nextNodes)) ||
		JSON.stringify(sanitizeEdges(prevEdges)) !==
			JSON.stringify(sanitizeEdges(nextEdges));

	return { doc, changed };
}

export async function buildTagViewDoc(
	tag: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const norm = tag.startsWith("#") ? tag : `#${tag}`;
	const v = viewId({ kind: "tag", tag: norm });
	const limit = options.limit ?? 500;
	const results = await invoke("tag_notes", { tag: v.selector, limit });

	const ids = (results ?? [])
		.map((r) => r.id)
		.filter(Boolean)
		.slice(0, limit);

	// Fetch content for all notes (prefer index; fill small gaps from disk)
	const noteContents = await fetchNotePreviewsAllAtOnce(ids);

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];
	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));
	const titleById = new Map(
		(results ?? []).map((r) => [r.id, r.title] as const),
	);

	const nextNodes: CanvasNode[] = [];
	const newNodes: CanvasNode[] = [];
	for (let i = 0; i < ids.length; i++) {
		const relPath = ids[i] as string;
		const existingNode = prevById.get(relPath);
		const noteData = noteContents.get(relPath);
		if (existingNode) {
			// Update content for existing note nodes
			if (existingNode.type === "note") {
				nextNodes.push({
					...existingNode,
					position: snapPoint(existingNode.position ?? { x: 0, y: 0 }),
					data: {
						...existingNode.data,
						title:
							noteData?.title ||
							(existingNode.data as { title?: string }).title ||
							titleForFile(relPath),
						content: noteData?.content || "",
					},
				});
			} else {
				nextNodes.push({
					...existingNode,
					position: snapPoint(existingNode.position ?? { x: 0, y: 0 }),
				});
			}
			continue;
		}
		const node: CanvasNode = {
			id: relPath,
			type: "note",
			position: { x: 0, y: 0 },
			data: {
				noteId: relPath,
				title:
					noteData?.title || titleById.get(relPath) || titleForFile(relPath),
				content: noteData?.content || "",
			},
		};
		nextNodes.push(node);
		newNodes.push(node);
	}

	for (const n of prevNodes) {
		if (n.type === "note") continue;
		nextNodes.push({
			...n,
			position: snapPoint(n.position ?? { x: 0, y: 0 }),
		});
	}

	if (newNodes.length > 0) {
		const shouldLayoutAll = !prev || prevNodes.length === 0;
		const baseNodes = shouldLayoutAll ? nextNodes : newNodes;
		const startY = shouldLayoutAll
			? 0
			: maxBottomForNodes(nextNodes) + GRID_GAP * 2;
		const positions = computeGridPositions(
			baseNodes.map((n) => ({
				id: n.id,
				type: n.type ?? "",
				data: n.data ?? {},
			})),
			{ startX: 0, startY },
		);
		for (const node of baseNodes) {
			const pos = positions.get(node.id);
			if (pos) node.position = pos;
		}
	}

	const nextIds = new Set(nextNodes.map((n) => n.id));
	const nextEdges = prevEdges.filter(
		(e) => nextIds.has(e.source) && nextIds.has(e.target),
	);

	const doc: ViewDoc = {
		schema_version: 1,
		view_id: v.id,
		kind: "tag",
		selector: v.selector,
		title: v.title,
		options: { limit },
		nodes: nextNodes,
		edges: nextEdges,
	};

	const changed =
		!prev ||
		JSON.stringify(sanitizeNodes(prevNodes)) !==
			JSON.stringify(sanitizeNodes(nextNodes)) ||
		JSON.stringify(sanitizeEdges(prevEdges)) !==
			JSON.stringify(sanitizeEdges(nextEdges));

	return { doc, changed };
}
