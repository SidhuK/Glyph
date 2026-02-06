import { GRID_GAP, computeGridPositions, snapPoint } from "../../canvasLayout";
import { titleForFile } from "../../notePreview";
import type { CanvasNode, FsEntry } from "../../tauri";
import { invoke } from "../../tauri";
import { sanitizeEdges, sanitizeNodes } from "../sanitize";
import type { ViewDoc, ViewOptions } from "../types";
import { basename, viewId } from "../utils";
import {
	fetchNotePreviewsAllAtOnce,
	maxBottomForNodes,
	normalizeLegacyFrameChildren,
} from "./common";

export async function buildFolderViewDoc(
	dir: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "folder", dir });
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
	const normalizedPrevNodes = normalizeLegacyFrameChildren(prevNodes);
	const prevById = new Map(normalizedPrevNodes.map((n) => [n.id, n] as const));
	const nextNodes: CanvasNode[] = [];
	const newNodes: CanvasNode[] = [];

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
							(typeof existingNode.data.title === "string"
								? existingNode.data.title
								: undefined) ||
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

	for (const n of normalizedPrevNodes) {
		if (
			n.type === "note" ||
			n.type === "file" ||
			n.type === "folder" ||
			n.type === "folderPreview"
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
