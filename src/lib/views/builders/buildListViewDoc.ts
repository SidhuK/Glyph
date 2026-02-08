import {
	GRID_GAP,
	columnsForMaxRows,
	computeGridPositions,
	estimateNodeSize,
	snapPoint,
} from "../../canvasLayout";
import type { CanvasNode } from "../../tauri";
import type { ViewDoc, ViewKind, ViewOptions } from "../types";
import { hasViewDocChanged } from "./common";

export interface BuildPrimaryResult {
	node: CanvasNode;
	isNew: boolean;
}

export interface BuildListViewDocParams {
	kind: ViewKind;
	viewId: string;
	selector: string;
	title: string;
	options: ViewOptions;
	existing: ViewDoc | null;
	primaryIds: string[];
	normalizePrevNodes?: (nodes: CanvasNode[]) => CanvasNode[];
	buildPrimaryNode: (args: {
		id: string;
		prevNode: CanvasNode | undefined;
	}) => BuildPrimaryResult;
	shouldPreservePrevNode: (node: CanvasNode) => boolean;
}

function maxRightForNodes(nodes: CanvasNode[]): number {
	let maxRight = 0;
	for (const node of nodes) {
		const size = estimateNodeSize({
			id: node.id,
			type: node.type ?? "",
			data: node.data ?? {},
		});
		const right = (node.position?.x ?? 0) + size.w;
		if (right > maxRight) maxRight = right;
	}
	return maxRight;
}

export function buildListViewDoc(params: BuildListViewDocParams): {
	doc: ViewDoc;
	changed: boolean;
} {
	const prev = params.existing;
	const prevNodesRaw = prev?.nodes ?? [];
	const prevEdges = prev?.edges ?? [];

	const prevNodes = params.normalizePrevNodes
		? params.normalizePrevNodes(prevNodesRaw)
		: prevNodesRaw;
	const prevById = new Map(prevNodes.map((n) => [n.id, n] as const));

	const nextNodes: CanvasNode[] = [];
	const newNodes: CanvasNode[] = [];

	for (const id of params.primaryIds) {
		const prevNode = prevById.get(id);
		const { node, isNew } = params.buildPrimaryNode({ id, prevNode });
		node.position = snapPoint(node.position ?? { x: 0, y: 0 });
		nextNodes.push(node);
		if (isNew) newNodes.push(node);
	}

	const nextIdSet = new Set(nextNodes.map((n) => n.id));
	for (const n of prevNodes) {
		if (nextIdSet.has(n.id)) continue;
		if (!params.shouldPreservePrevNode(n)) continue;
		nextNodes.push({
			...n,
			position: snapPoint(n.position ?? { x: 0, y: 0 }),
		});
		nextIdSet.add(n.id);
	}

	if (newNodes.length > 0) {
		const shouldLayoutAll = !prev || prevNodesRaw.length === 0;
		const baseNodes = shouldLayoutAll ? nextNodes : newNodes;
		const startX = shouldLayoutAll
			? 0
			: maxRightForNodes(nextNodes) + GRID_GAP * 2;
		const columns = columnsForMaxRows(baseNodes.length);
		const positions = computeGridPositions(
			baseNodes.map((n) => ({
				id: n.id,
				type: n.type ?? "",
				data: n.data ?? {},
			})),
			{ startX, startY: 0, columns },
		);
		for (const node of baseNodes) {
			const pos = positions.get(node.id);
			if (pos) node.position = pos;
		}
	}

	const nextEdges = prevEdges.filter(
		(e) => nextIdSet.has(e.source) && nextIdSet.has(e.target),
	);

	const doc: ViewDoc = {
		schema_version: 1,
		view_id: params.viewId,
		kind: params.kind,
		selector: params.selector,
		title: params.title,
		options: params.options,
		nodes: nextNodes,
		edges: nextEdges,
	};

	const changed = hasViewDocChanged(
		prev,
		prevNodesRaw,
		prevEdges,
		nextNodes,
		nextEdges,
	);

	return { doc, changed };
}
