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
	const cols = 5;
	const col = i % cols;
	const row = Math.floor(i / cols);
	return { x: col * 340, y: row * 300 };
}

function titleForFile(relPath: string): string {
	const name = basename(relPath);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function parseNoteContent(
	relPath: string,
	text: string,
): { title: string; content: string } {
	// Extract title from frontmatter or first heading
	let title = titleForFile(relPath);
	// Check for YAML frontmatter title
	const fmMatch = text.match(
		/^---\n[\s\S]*?title:\s*["']?([^\n"']+)["']?[\s\S]*?\n---/,
	);
	if (fmMatch?.[1]) {
		title = fmMatch[1].trim();
	} else {
		// Check for first # heading
		const headingMatch = text.match(/^#\s+(.+)$/m);
		if (headingMatch?.[1]) {
			title = headingMatch[1].trim();
		}
	}
	// Strip frontmatter from content for display
	let content = text;
	if (text.startsWith("---\n")) {
		const endIdx = text.indexOf("\n---\n", 4);
		if (endIdx !== -1) {
			content = text.slice(endIdx + 5).trim();
		}
	}
	// Limit to first 20 lines for performance
	const lines = content.split("\n");
	if (lines.length > 20) {
		content = `${lines.slice(0, 20).join("\n")}\n…`;
	}
	return { title, content };
}

async function fetchNoteContents(
	noteIds: string[],
): Promise<Map<string, { title: string; content: string }>> {
	if (noteIds.length === 0) {
		return new Map();
	}

	try {
		// Use batch command to fetch all notes in a single IPC call
		const batchResults = await invoke("vault_read_texts_batch", {
			paths: noteIds,
		});
		const resultMap = new Map<string, { title: string; content: string }>();

		for (const doc of batchResults) {
			if (doc.text != null) {
				resultMap.set(doc.rel_path, parseNoteContent(doc.rel_path, doc.text));
			} else {
				// File had an error (e.g., not found), use fallback
				resultMap.set(doc.rel_path, {
					title: titleForFile(doc.rel_path),
					content: "",
				});
			}
		}

		return resultMap;
	} catch {
		// Fallback: return empty content for all notes
		const resultMap = new Map<string, { title: string; content: string }>();
		for (const id of noteIds) {
			resultMap.set(id, { title: titleForFile(id), content: "" });
		}
		return resultMap;
	}
}

export async function buildFolderViewDoc(
	dir: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "folder", dir });
	const recursive = options.recursive ?? true;
	const limit = options.limit ?? 500;
	const allFiles = await invoke("vault_list_files", {
		dir: v.selector || null,
		recursive,
		limit: Math.max(limit, 2_000),
	});

	const mdPaths = new Set<string>(
		(allFiles as FsEntry[]).filter((f) => f.is_markdown).map((f) => f.rel_path),
	);
	const otherPaths = new Set<string>(
		(allFiles as FsEntry[])
			.filter((f) => !f.is_markdown)
			.map((f) => f.rel_path),
	);

	const sortedFiles = [...mdPaths].sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);
	const sortedOtherFiles = [...otherPaths].sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);

	// Fetch content for all markdown files
	const noteContents = await fetchNoteContents(sortedFiles);

	const prev = existing;
	const prevNodes = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];

	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));
	const nextNodes: CanvasNode[] = [];

	if (!prev) {
		type Group = { key: string; title: string; files: string[] };
		const prefix = v.selector
			? `${v.selector.replace(/\\/g, "/").replace(/\/+$/g, "")}/`
			: "";
		const groups = new Map<string, Group>();

		for (const relPath of [...sortedFiles, ...sortedOtherFiles]) {
			const after =
				prefix && relPath.startsWith(prefix)
					? relPath.slice(prefix.length)
					: relPath;
			const parts = after.split("/").filter(Boolean);
			const key = parts.length > 1 ? (parts[0] ?? "") : "__root__";
			const title = key === "__root__" ? "Root" : key;
			const g = groups.get(key) ?? { key, title, files: [] };
			g.files.push(relPath);
			groups.set(key, g);
		}

		const orderedGroups = [...groups.values()].sort((a, b) =>
			a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
		);

		const groupCols = 2;
		const frameSpacingX = 80;
		const frameSpacingY = 80;
		const framePadX = 50;
		const framePadY = 60;
		const noteCellW = 320;
		const noteCellH = 280;

		const frames: CanvasNode[] = [];
		const notes: CanvasNode[] = [];

		for (let gi = 0; gi < orderedGroups.length; gi++) {
			const g = orderedGroups[gi];
			if (!g) continue;
			const n = g.files.length;
			const innerCols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n))));
			const innerRows = Math.max(1, Math.ceil(n / innerCols));

			const width = framePadX * 2 + innerCols * noteCellW;
			const height = framePadY * 2 + innerRows * noteCellH;

			const gx = gi % groupCols;
			const gy = Math.floor(gi / groupCols);
			const frameX = gx * (width + frameSpacingX);
			const frameY = gy * (height + frameSpacingY);

			const frameId = `folder:${v.selector ? `${v.selector}/${g.key}` : g.key}`;
			frames.push({
				id: frameId,
				type: "frame",
				position: { x: frameX, y: frameY },
				data: { title: g.title },
				style: { width, height },
			} as CanvasNode);

			for (let i = 0; i < g.files.length; i++) {
				const relPath = g.files[i] as string;
				const isMarkdown = mdPaths.has(relPath);
				const col = i % innerCols;
				const row = Math.floor(i / innerCols);
				const noteData = isMarkdown ? noteContents.get(relPath) : null;
				notes.push({
					id: relPath,
					type: isMarkdown ? "note" : "file",
					parentNode: frameId,
					extent: "parent",
					position: {
						x: framePadX + col * noteCellW,
						y: framePadY + row * noteCellH,
					},
					data: isMarkdown
						? {
								noteId: relPath,
								title: noteData?.title || titleForFile(relPath),
								content: noteData?.content || "",
							}
						: { path: relPath, title: basename(relPath) },
				} as CanvasNode);
			}
		}

		nextNodes.push(...frames, ...notes);
	} else {
		const merged = [...sortedFiles, ...sortedOtherFiles];
		for (let i = 0; i < merged.length; i++) {
			const relPath = merged[i] as string;
			const existingNode = prevById.get(relPath);
			if (existingNode) {
				// Update content for existing note nodes
				if (existingNode.type === "note") {
					const noteData = noteContents.get(relPath);
					nextNodes.push({
						...existingNode,
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
					nextNodes.push(existingNode);
				}
				continue;
			}
			const isMarkdown = mdPaths.has(relPath);
			const noteData = isMarkdown ? noteContents.get(relPath) : null;
			nextNodes.push({
				id: relPath,
				type: isMarkdown ? "note" : "file",
				position: defaultPositionForIndex(i),
				data: isMarkdown
					? {
							noteId: relPath,
							title: noteData?.title || titleForFile(relPath),
							content: noteData?.content || "",
						}
					: { path: relPath, title: basename(relPath) },
			});
		}

		// Preserve non-note nodes (text/link/frame/etc.)
		for (const n of prevNodes) {
			if (n.type === "note") continue;
			nextNodes.push(n);
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

	// Fetch content for all notes
	const noteContents = await fetchNoteContents(ids);

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
		const noteData = noteContents.get(relPath);
		if (existingNode) {
			// Update content for existing note nodes
			if (existingNode.type === "note") {
				nextNodes.push({
					...existingNode,
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
				nextNodes.push(existingNode);
			}
			continue;
		}
		nextNodes.push({
			id: relPath,
			type: "note",
			position: defaultPositionForIndex(i),
			data: {
				noteId: relPath,
				title:
					noteData?.title || titleById.get(relPath) || titleForFile(relPath),
				content: noteData?.content || "",
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

	// Fetch content for all notes
	const noteContents = await fetchNoteContents(ids);

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
		const noteData = noteContents.get(relPath);
		if (existingNode) {
			// Update content for existing note nodes
			if (existingNode.type === "note") {
				nextNodes.push({
					...existingNode,
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
				nextNodes.push(existingNode);
			}
			continue;
		}
		nextNodes.push({
			id: relPath,
			type: "note",
			position: defaultPositionForIndex(i),
			data: {
				noteId: relPath,
				title:
					noteData?.title || titleById.get(relPath) || titleForFile(relPath),
				content: noteData?.content || "",
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
