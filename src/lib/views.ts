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

function defaultPositionForIndex(i: number): { x: number; y: number } {
	const cols = 6;
	const col = i % cols;
	const row = Math.floor(i / cols);
	return { x: col * 320, y: row * 200 };
}

function titleForFile(relPath: string): string {
	const name = basename(relPath);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

export async function buildFolderViewDoc(
	dir: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "folder", dir });
	const recursive = options.recursive ?? true;
	const limit = options.limit ?? 500;
	const files = await invoke("vault_list_markdown_files", {
		dir: v.selector || null,
		recursive,
		limit,
	});

	const fileSet = new Set<string>(
		(files as FsEntry[]).filter((f) => f.is_markdown).map((f) => f.rel_path),
	);
	const sortedFiles = [...fileSet].sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];

	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));
	const nextNodes: CanvasNode[] = [];

	for (let i = 0; i < sortedFiles.length; i++) {
		const relPath = sortedFiles[i] as string;
		const existingNode = prevById.get(relPath);
		if (existingNode) {
			nextNodes.push(existingNode);
			continue;
		}
		nextNodes.push({
			id: relPath,
			type: "note",
			position: defaultPositionForIndex(i),
			data: { noteId: relPath, title: titleForFile(relPath) },
		});
	}

	// Preserve non-note nodes (text/link/frame/etc.)
	for (const n of prevNodes) {
		if (n.type === "note") continue;
		nextNodes.push(n);
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

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];
	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));
	const titleById = new Map(
		(results ?? []).map((r) => [r.id, r.title] as const),
	);

	const nextNodes: CanvasNode[] = [];
	for (let i = 0; i < ids.length; i++) {
		const relPath = ids[i] as string;
		const existingNode = prevById.get(relPath);
		if (existingNode) {
			nextNodes.push(existingNode);
			continue;
		}
		nextNodes.push({
			id: relPath,
			type: "note",
			position: defaultPositionForIndex(i),
			data: {
				noteId: relPath,
				title: titleById.get(relPath) || titleForFile(relPath),
			},
		});
	}

	for (const n of prevNodes) {
		if (n.type === "note") continue;
		nextNodes.push(n);
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

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];
	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));
	const titleById = new Map(
		(results ?? []).map((r) => [r.id, r.title] as const),
	);

	const nextNodes: CanvasNode[] = [];
	for (let i = 0; i < ids.length; i++) {
		const relPath = ids[i] as string;
		const existingNode = prevById.get(relPath);
		if (existingNode) {
			nextNodes.push(existingNode);
			continue;
		}
		nextNodes.push({
			id: relPath,
			type: "note",
			position: defaultPositionForIndex(i),
			data: {
				noteId: relPath,
				title: titleById.get(relPath) || titleForFile(relPath),
			},
		});
	}

	for (const n of prevNodes) {
		if (n.type === "note") continue;
		nextNodes.push(n);
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
