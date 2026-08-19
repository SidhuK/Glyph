import Graph from "graphology";
import { periodKindFromFilename } from "../../lib/periodNotes";
import type { LocalNoteConnections, SpaceConnections } from "../../lib/tauri";
import {
	LOCAL_CENTER_NODE_SIZE,
	spaceConnectionsDensityProfile,
} from "./connectionsDensity";
import type { GraphPosition } from "./connectionsLayout";
import { hashString, randomUnit } from "./connectionsRandom";

export type ConnectionsNodeKind = "note" | "daily" | "weekly" | "tag";
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

function spaceNoteKind(
	noteId: string,
	dailyNotesFolder: string | null,
	weeklyNotesEnabled: boolean,
): Exclude<ConnectionsNodeKind, "tag"> {
	if (dailyNotesFolder === null) return "note";
	const folder = dailyNotesFolder.replace(/\\/g, "/").replace(/\/+$/g, "");
	const id = noteId.replace(/\\/g, "/");
	const prefix = folder ? `${folder}/` : "";
	if (prefix && !id.startsWith(prefix)) return "note";
	const filename = prefix ? id.slice(prefix.length) : id;
	if (!filename || filename.includes("/")) return "note";
	const periodKind = periodKindFromFilename(filename);
	if (periodKind === "day") return "daily";
	if (periodKind === "week" && weeklyNotesEnabled) return "weekly";
	return "note";
}

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
	const neighbors = new Map<string, Set<string>>();
	const counts = new Map<string, number>();
	for (const node of payload.nodes) {
		neighbors.set(node.id, new Set());
		counts.set(node.id, 0);
	}
	for (const tag of payload.tags) counts.set(tag.id, 0);

	for (const edge of payload.edges) {
		if (edge.from_id === edge.to_id) continue;
		neighbors.get(edge.from_id)?.add(edge.to_id);
		neighbors.get(edge.to_id)?.add(edge.from_id);
	}
	for (const [id, linked] of neighbors) counts.set(id, linked.size);
	for (const edge of payload.tag_edges) {
		incrementConnectionCount(counts, edge.tag_id);
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
	dailyNotesFolder: string | null,
	weeklyNotesEnabled: boolean,
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
			size: scaledNodeSize(
				connectionCount,
				density.noteSizeRange[0],
				density.noteSizeRange[1],
				maxConnections,
			),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: spaceNoteKind(node.id, dailyNotesFolder, weeklyNotesEnabled),
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
			size: scaledNodeSize(
				connectionCount,
				density.tagSizeRange[0],
				density.tagSizeRange[1],
				maxConnections,
			),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: "tag",
			isCenter: false,
			isIsolated: connectionCount === 0,
		});
	}

	const edgeScale = density.edgeScale;

	for (const [index, edge] of payload.edges.entries()) {
		if (!graph.hasNode(edge.from_id) || !graph.hasNode(edge.to_id)) continue;
		const edgeId = `${edge.kind}:${edge.from_id}->${edge.to_id}:${index}`;
		const weightScale = 1 + Math.log1p(Math.max(edge.weight, 1)) * 0.2;
		graph.addEdgeWithKey(edgeId, edge.from_id, edge.to_id, {
			colorRole: "default",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: 0.42 * edgeScale * weightScale,
		});
	}

	for (const [index, edge] of payload.tag_edges.entries()) {
		if (!graph.hasNode(edge.tag_id) || !graph.hasNode(edge.note_id)) continue;
		const edgeId = `tag:${edge.tag_id}->${edge.note_id}:${index}`;
		graph.addEdgeWithKey(edgeId, edge.tag_id, edge.note_id, {
			colorRole: "tag",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: 0.32 * edgeScale,
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
