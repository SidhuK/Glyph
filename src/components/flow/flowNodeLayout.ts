import { type FlowNode, nextFlowNodeId } from "../../lib/flow";

export const DEFAULT_NODE_WIDTH = 280;
export const DEFAULT_NODE_HEIGHT = 180;
export const GROUP_PADDING = 48;

export function groupSelectedFlowNodes(nodes: FlowNode[]): FlowNode[] {
	const selectedNodes = nodes.filter(
		(node) => node.selected && node.data.flowType !== "group",
	);
	if (selectedNodes.length === 0) return nodes;

	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	const selectedRects = selectedNodes.map((node) =>
		getFlowNodeRect(node, nodeMap),
	);
	const bounds = getFlowRectBounds(selectedRects);
	const groupId = nextFlowNodeId("group");
	const groupPosition = {
		x: Math.round(bounds.x - GROUP_PADDING),
		y: Math.round(bounds.y - GROUP_PADDING),
	};
	const groupWidth = Math.round(bounds.width + GROUP_PADDING * 2);
	const groupHeight = Math.round(bounds.height + GROUP_PADDING * 2);
	const selectedIds = new Set(selectedNodes.map((node) => node.id));
	const groupNode: FlowNode = {
		...createFlowNode("group", groupPosition),
		id: groupId,
		width: groupWidth,
		height: groupHeight,
		style: { width: groupWidth, height: groupHeight },
		selected: true,
	};

	const nextNodes = nodes.map((node) => {
		if (!selectedIds.has(node.id)) {
			return { ...node, selected: false };
		}
		const absolute = getFlowNodeAbsolutePosition(node, nodeMap);
		return {
			...node,
			parentId: groupId,
			extent: "parent" as const,
			position: {
				x: Math.round(absolute.x - groupPosition.x),
				y: Math.round(absolute.y - groupPosition.y),
			},
			selected: false,
		};
	});

	return orderFlowNodes([...nextNodes, groupNode]);
}

export function parentNodeToContainingGroup(
	nodes: FlowNode[],
	nodeId: string,
): FlowNode[] {
	const node = nodes.find((current) => current.id === nodeId);
	if (!node || node.data.flowType === "group") return nodes;

	const nodeMap = new Map(nodes.map((current) => [current.id, current]));
	const targetGroup = findContainingGroup(node, nodes, nodeMap);
	if (!targetGroup || node.parentId === targetGroup.id) return nodes;

	const nodeAbsolute = getFlowNodeAbsolutePosition(node, nodeMap);
	const groupAbsolute = getFlowNodeAbsolutePosition(targetGroup, nodeMap);
	const nextNodes = nodes.map((current) =>
		current.id === node.id
			? {
					...current,
					parentId: targetGroup.id,
					extent: "parent" as const,
					position: {
						x: Math.round(nodeAbsolute.x - groupAbsolute.x),
						y: Math.round(nodeAbsolute.y - groupAbsolute.y),
					},
				}
			: current,
	);

	return orderFlowNodes(nextNodes);
}

export function detachFlowNodeFromParent(
	nodes: FlowNode[],
	nodeId: string,
): FlowNode[] {
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	return nodes.map((node) => {
		if (node.id !== nodeId || !node.parentId) return node;
		const absolute = getFlowNodeAbsolutePosition(node, nodeMap);
		return {
			...node,
			parentId: undefined,
			extent: undefined,
			position: {
				x: Math.round(absolute.x),
				y: Math.round(absolute.y),
			},
		};
	});
}

export function removeSelectedFlowNodes(
	nodes: FlowNode[],
	selectedNodeIds: Set<string>,
): FlowNode[] {
	if (selectedNodeIds.size === 0) return nodes;
	const selectedGroupIds = new Set(
		nodes
			.filter(
				(node) =>
					selectedNodeIds.has(node.id) && node.data.flowType === "group",
			)
			.map((node) => node.id),
	);
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));

	return nodes
		.flatMap((node) => {
			if (selectedNodeIds.has(node.id)) return [];
			if (!node.parentId || !selectedGroupIds.has(node.parentId)) return [node];
			const absolute = getFlowNodeAbsolutePosition(node, nodeMap);
			return [
				{
					...node,
					parentId: undefined,
					extent: undefined,
					position: {
						x: Math.round(absolute.x),
						y: Math.round(absolute.y),
					},
				},
			];
		})
		.map((node) =>
			node.parentId && selectedNodeIds.has(node.parentId)
				? { ...node, parentId: undefined, extent: undefined }
				: node,
		);
}

export function createFlowNode(
	kind: "text" | "group" | "link",
	position: { x: number; y: number },
): FlowNode {
	if (kind === "group") {
		return {
			id: nextFlowNodeId("group"),
			type: "flowGroup",
			position,
			width: 420,
			height: 280,
			style: { width: 420, height: 280 },
			zIndex: -1,
			data: {
				flowType: "group",
				label: "Group",
				color: "#d7e7ff",
				glyphKind: "group",
			},
		};
	}

	if (kind === "link") {
		return {
			id: nextFlowNodeId("link"),
			type: "flowLink",
			position,
			width: DEFAULT_NODE_WIDTH,
			height: 130,
			style: { width: DEFAULT_NODE_WIDTH, height: 130 },
			data: {
				flowType: "link",
				url: "https://",
				color: "#e6e7eb",
				glyphKind: "link",
			},
		};
	}

	return {
		id: nextFlowNodeId(kind),
		type: "flowText",
		position,
		width: DEFAULT_NODE_WIDTH,
		height: DEFAULT_NODE_HEIGHT,
		style: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
		data: {
			flowType: "text",
			text: "Text",
			color: "#f7f7f8",
			glyphKind: "text",
		},
	};
}

export function createFlowFileNode(
	kind: "note" | "file",
	file: string,
	position: { x: number; y: number },
): FlowNode {
	return {
		id: nextFlowNodeId(kind),
		type: "flowFile",
		position,
		width: DEFAULT_NODE_WIDTH,
		height: 150,
		style: { width: DEFAULT_NODE_WIDTH, height: 150 },
		data: {
			flowType: "file",
			file,
			color: kind === "note" ? "#d9f4e8" : "#e6e7eb",
			glyphKind: kind,
		},
	};
}

export function defaultNodeColor(node: FlowNode): string {
	if (node.data.flowType === "text") {
		return node.data.glyphKind === "sticky" ? "#fff4b8" : "#f7f7f8";
	}
	if (node.data.flowType === "file") {
		return node.data.glyphKind === "note" ? "#d9f4e8" : "#e6e7eb";
	}
	if (node.data.flowType === "group") return "#d7e7ff";
	return "#e6e7eb";
}

function findContainingGroup(
	node: FlowNode,
	nodes: FlowNode[],
	nodeMap: Map<string, FlowNode>,
): FlowNode | null {
	const nodeRect = getFlowNodeRect(node, nodeMap);
	const nodeCenter = {
		x: nodeRect.x + nodeRect.width / 2,
		y: nodeRect.y + nodeRect.height / 2,
	};

	const containingGroups = nodes
		.filter((candidate) => candidate.data.flowType === "group")
		.map((candidate) => ({
			node: candidate,
			rect: getFlowNodeRect(candidate, nodeMap),
		}))
		.filter(({ node: candidate, rect }) => {
			if (candidate.id === node.id) return false;
			return (
				nodeCenter.x >= rect.x &&
				nodeCenter.x <= rect.x + rect.width &&
				nodeCenter.y >= rect.y &&
				nodeCenter.y <= rect.y + rect.height
			);
		})
		.sort(
			(a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height,
		);

	return containingGroups[0]?.node ?? null;
}

function getFlowRectBounds(
	rects: Array<{ x: number; y: number; width: number; height: number }>,
): { x: number; y: number; width: number; height: number } {
	const minX = Math.min(...rects.map((rect) => rect.x));
	const minY = Math.min(...rects.map((rect) => rect.y));
	const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
	const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getFlowNodeRect(
	node: FlowNode,
	nodeMap: Map<string, FlowNode>,
): { x: number; y: number; width: number; height: number } {
	const position = getFlowNodeAbsolutePosition(node, nodeMap);
	const size = getFlowNodeSize(node);
	return { ...position, ...size };
}

function getFlowNodeAbsolutePosition(
	node: FlowNode,
	nodeMap: Map<string, FlowNode>,
): { x: number; y: number } {
	let x = node.position.x;
	let y = node.position.y;
	let parentId = node.parentId;
	const visited = new Set<string>();

	while (parentId && !visited.has(parentId)) {
		visited.add(parentId);
		const parent = nodeMap.get(parentId);
		if (!parent) break;
		x += parent.position.x;
		y += parent.position.y;
		parentId = parent.parentId;
	}

	return { x, y };
}

function getFlowNodeSize(node: FlowNode): {
	width: number;
	height: number;
} {
	return {
		width:
			typeof node.measured?.width === "number"
				? node.measured.width
				: Number(node.style?.width) || node.width || DEFAULT_NODE_WIDTH,
		height:
			typeof node.measured?.height === "number"
				? node.measured.height
				: Number(node.style?.height) || node.height || DEFAULT_NODE_HEIGHT,
	};
}

function orderFlowNodes(nodes: FlowNode[]): FlowNode[] {
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	const ordered: FlowNode[] = [];
	const visited = new Set<string>();

	const visit = (node: FlowNode) => {
		if (visited.has(node.id)) return;
		if (node.parentId) {
			const parent = nodeMap.get(node.parentId);
			if (parent) visit(parent);
		}
		visited.add(node.id);
		ordered.push(node);
	};

	for (const node of nodes) {
		if (!node.parentId) visit(node);
	}
	for (const node of nodes) {
		visit(node);
	}

	return ordered;
}
