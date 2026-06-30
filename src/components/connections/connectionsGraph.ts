import Graph from "graphology";
import type { LocalNoteConnections, SpaceConnections } from "../../lib/tauri";
import {
	LOCAL_CENTER_NODE_SIZE,
	spaceConnectionsDensityProfile,
} from "./connectionsDensity";
import type { GraphPosition } from "./connectionsLayout";
import { hashString, randomUnit } from "./connectionsRandom";

export type ConnectionsNodeKind = "note" | "tag";
export type ConnectionsEdgeColorRole =
	| "default"
	| "accent"
	| "internal"
	| "tag";

export type ConnectionsGraphVariant = "space" | "local";

export interface ConnectionsNodeAttributes {
	x: number;
	y: number;
	label: string;
	size: number;
	color: string;
	kind: ConnectionsNodeKind;
	isCenter: boolean;
	isIsolated: boolean;
}

export interface ConnectionsEdgeAttributes {
	colorRole: ConnectionsEdgeColorRole;
	color: string;
	size: number;
}

export type ConnectionsGraph = Graph<
	ConnectionsNodeAttributes,
	ConnectionsEdgeAttributes
>;

const MIN_TAG_NODE_SIZE = 6;
const MAX_TAG_NODE_SIZE = 13;
const REDUCER_COLOR_PLACEHOLDER = "#000000";

function scaledNodeSize(
	weight: number,
	minSize: number,
	maxSize: number,
	maxWeight: number,
) {
	if (weight <= 0) return minSize;
	const normalized = Math.log1p(weight) / Math.log1p(Math.max(maxWeight, 1));
	return minSize + normalized * (maxSize - minSize);
}

function incrementConnectionCount(counts: Map<string, number>, id: string) {
	counts.set(id, (counts.get(id) ?? 0) + 1);
}

function maxConnectionCount(counts: Map<string, number>) {
	let maximum = 1;
	for (const count of counts.values()) maximum = Math.max(maximum, count);
	return maximum;
}

function spaceConnectionCounts(payload: SpaceConnections) {
	const counts = new Map<string, number>();
	for (const node of payload.nodes) counts.set(node.id, 0);
	for (const tag of payload.tags) counts.set(tag.id, 0);

	for (const edge of payload.edges) {
		incrementConnectionCount(counts, edge.from_id);
		incrementConnectionCount(counts, edge.to_id);
	}
	for (const edge of payload.tag_edges) {
		incrementConnectionCount(counts, edge.tag_id);
		incrementConnectionCount(counts, edge.note_id);
	}

	return counts;
}

function localConnectionCounts(payload: LocalNoteConnections) {
	const counts = new Map<string, number>();
	for (const node of payload.nodes) counts.set(node.id, 0);
	for (const tag of payload.tags) counts.set(tag.id, 0);

	for (const edge of payload.edges) {
		incrementConnectionCount(counts, edge.source);
		incrementConnectionCount(counts, edge.target);
	}
	for (const edge of payload.tag_edges) {
		incrementConnectionCount(counts, edge.tag_id);
		incrementConnectionCount(counts, edge.note_id);
	}

	return counts;
}

function nodeSizeFromRange(
	weight: number,
	maxWeight: number,
	range: readonly [number, number],
) {
	return scaledNodeSize(weight, range[0], range[1], maxWeight);
}

function seedLocalPositions(graph: LocalNoteConnections) {
	const positions = new Map<string, { x: number; y: number }>();
	const ring: string[] = [];

	for (const node of graph.nodes) {
		if (node.is_center) {
			positions.set(node.id, { x: 0, y: 0 });
			continue;
		}
		ring.push(node.id);
	}
	for (const tag of graph.tags) ring.push(tag.id);
	ring.sort();

	// Phyllotaxis (golden-angle) spread fills a disc evenly, so neighbours keep
	// consistent spacing instead of the clumping a uniform-random layout caused.
	// Sigma normalizes coordinates to the viewport, so only the relative pattern
	// matters; the radial step just needs to grow as sqrt(index).
	const goldenAngle = Math.PI * (3 - Math.sqrt(5));
	const radialStep = 260;
	ring.forEach((id, index) => {
		const seed = hashString(id);
		const radius = radialStep * Math.sqrt(index + 1);
		const angle = index * goldenAngle;
		const jitter = radialStep * 0.16;
		positions.set(id, {
			x: Math.cos(angle) * radius + (randomUnit(seed, 1) * 2 - 1) * jitter,
			y: Math.sin(angle) * radius + (randomUnit(seed, 2) * 2 - 1) * jitter,
		});
	});

	return positions;
}

function createGraph() {
	return new Graph<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>({
		multi: true,
		type: "mixed",
	});
}

export function buildSpaceConnectionsGraph(
	payload: SpaceConnections,
	positions: ReadonlyMap<string, GraphPosition>,
): ConnectionsGraph {
	const graph = createGraph();
	const nodeCount = payload.nodes.length + payload.tags.length;
	const edgeCount = payload.edges.length + payload.tag_edges.length;
	const density = spaceConnectionsDensityProfile(nodeCount, edgeCount);
	const connectionCounts = spaceConnectionCounts(payload);
	const maxConnections = maxConnectionCount(connectionCounts);

	for (const node of payload.nodes) {
		const position = positions.get(node.id) ?? { x: 1, y: 1 };
		const connectionCount = connectionCounts.get(node.id) ?? 0;
		graph.addNode(node.id, {
			x: position.x,
			y: position.y,
			label: node.title || node.id,
			size: nodeSizeFromRange(
				connectionCount,
				maxConnections,
				density.noteSizeRange,
			),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: "note",
			isCenter: false,
			isIsolated: connectionCount === 0,
		});
	}

	for (const tag of payload.tags) {
		const position = positions.get(tag.id) ?? { x: -1, y: 1 };
		const connectionCount = connectionCounts.get(tag.id) ?? 0;
		graph.addNode(tag.id, {
			x: position.x,
			y: position.y,
			label: tag.title,
			size: nodeSizeFromRange(
				connectionCount,
				maxConnections,
				density.tagSizeRange,
			),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: "tag",
			isCenter: false,
			isIsolated: connectionCount === 0,
		});
	}

	const edgeScale = density.edgeScale;

	for (const [index, edge] of payload.edges.entries()) {
		const edgeId = `${edge.kind}:${edge.from_id}->${edge.to_id}:${index}`;
		const isRelationship = edge.kind === "relationship";
		graph.addEdgeWithKey(edgeId, edge.from_id, edge.to_id, {
			colorRole: "default",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: (isRelationship ? 1.0 : 0.65) * edgeScale,
		});
	}

	for (const [index, edge] of payload.tag_edges.entries()) {
		const edgeId = `tag:${edge.tag_id}->${edge.note_id}:${index}`;
		graph.addEdgeWithKey(edgeId, edge.tag_id, edge.note_id, {
			colorRole: "tag",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: 0.6 * edgeScale,
		});
	}

	return graph;
}

export function buildLocalConnectionsGraph(
	payload: LocalNoteConnections,
): ConnectionsGraph {
	const graph = createGraph();
	const positions = seedLocalPositions(payload);
	const connectionCounts = localConnectionCounts(payload);
	const maxConnections = maxConnectionCount(connectionCounts);
	for (const node of payload.nodes) {
		const position = positions.get(node.id) ?? { x: 1, y: 1 };
		const connectionCount = connectionCounts.get(node.id) ?? 0;
		graph.addNode(node.id, {
			x: position.x,
			y: position.y,
			label: node.title || node.id,
			size: node.is_center
				? LOCAL_CENTER_NODE_SIZE
				: scaledNodeSize(connectionCount, 7, 13, maxConnections),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: "note",
			isCenter: node.is_center,
			isIsolated: connectionCount === 0,
		});
	}

	for (const tag of payload.tags) {
		const position = positions.get(tag.id) ?? { x: -1, y: 1 };
		const connectionCount = connectionCounts.get(tag.id) ?? 0;
		graph.addNode(tag.id, {
			x: position.x,
			y: position.y,
			label: tag.title,
			size: scaledNodeSize(
				connectionCount,
				MIN_TAG_NODE_SIZE,
				MAX_TAG_NODE_SIZE,
				maxConnections,
			),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: "tag",
			isCenter: false,
			isIsolated: connectionCount === 0,
		});
	}

	for (const [index, edge] of payload.edges.entries()) {
		const edgeId = `${edge.source}->${edge.target}:${index}`;
		const isFromCenter = edge.source === payload.center.id;
		const isToCenter = edge.target === payload.center.id;
		const isInternal = !isFromCenter && !isToCenter;
		let colorRole: ConnectionsEdgeColorRole = "default";
		let size = 0.8;
		if (isFromCenter) {
			colorRole = "accent";
			size = 1.25;
		} else if (isToCenter) {
			colorRole = "default";
			size = 1.05;
		} else if (isInternal) {
			colorRole = "internal";
		}

		graph.addEdgeWithKey(edgeId, edge.source, edge.target, {
			colorRole,
			color: REDUCER_COLOR_PLACEHOLDER,
			size,
		});
	}

	for (const [index, edge] of payload.tag_edges.entries()) {
		const edgeId = `${edge.tag_id}->${edge.note_id}:tag:${index}`;
		graph.addEdgeWithKey(edgeId, edge.tag_id, edge.note_id, {
			colorRole: "tag",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: 0.7,
		});
	}

	return graph;
}
