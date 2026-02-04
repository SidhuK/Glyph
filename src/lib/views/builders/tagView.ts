import { GRID_GAP, computeGridPositions, snapPoint } from "../../canvasLayout";
import { titleForFile } from "../../notePreview";
import type { CanvasNode } from "../../tauri";
import { invoke } from "../../tauri";
import { sanitizeEdges, sanitizeNodes } from "../sanitize";
import type { ViewDoc, ViewOptions } from "../types";
import { viewId } from "../utils";
import { fetchNotePreviewsAllAtOnce, maxBottomForNodes } from "./common";

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
