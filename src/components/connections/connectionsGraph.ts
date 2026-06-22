import Graph from "graphology";
import type { LocalNoteConnections, SpaceConnections } from "../../lib/tauri";

export type ConnectionsNodeKind = "note" | "tag";
export type ConnectionsEdgeColorRole =
	| "default"
	| "accent"
	| "incoming"
	| "internal"
	| "tag"
	| "relationship";

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
	type: "line" | "tag-line";
	colorRole: ConnectionsEdgeColorRole;
	color: string;
	size: number;
}

export type ConnectionsGraph = Graph<
	ConnectionsNodeAttributes,
	ConnectionsEdgeAttributes
>;

const MIN_TAG_NODE_SIZE = 8;
const MAX_TAG_NODE_SIZE = 17;
const REDUCER_COLOR_PLACEHOLDER = "#000000";

interface GraphPosition {
	x: number;
	y: number;
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

function hashString(value: string) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function randomUnit(seed: number, salt: number) {
	let value = seed ^ Math.imul(salt + 1, 0x9e3779b1);
	value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
	value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
	return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
}

function seedSpacePositions(graph: SpaceConnections) {
	const ids = [
		...graph.nodes.map((node) => node.id),
		...graph.tags.map((tag) => tag.id),
	].sort((left, right) => hashString(left) - hashString(right));
	const nodeCount = ids.length;
	const extent = Math.max(1200, Math.sqrt(nodeCount) * 180);
	const cellSize = Math.max(80, (extent / Math.sqrt(nodeCount)) * 0.78);
	const candidateCount = nodeCount >= 10000 ? 5 : 8;
	const clusterCount = Math.min(
		12,
		Math.max(4, Math.round(Math.sqrt(nodeCount) / 12)),
	);
	const layoutSeed = hashString("glyph-space-connections");
	const clusterCenters = Array.from({ length: clusterCount }, (_, index) => ({
		x: (randomUnit(layoutSeed, index * 3) * 2 - 1) * extent * 0.82,
		y: (randomUnit(layoutSeed, index * 3 + 1) * 2 - 1) * extent * 0.62,
		spread: extent * (0.17 + randomUnit(layoutSeed, index * 3 + 2) * 0.11),
	}));
	const positions = new Map<string, GraphPosition>();
	const spatialGrid = new Map<string, GraphPosition[]>();

	const gridCoordinate = (value: number) => Math.floor(value / cellSize);
	const gridKey = (x: number, y: number) => `${x}:${y}`;
	const nearestDistanceSquared = (candidate: GraphPosition) => {
		const cellX = gridCoordinate(candidate.x);
		const cellY = gridCoordinate(candidate.y);
		let nearest = Number.POSITIVE_INFINITY;

		for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
			for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
				const nearby = spatialGrid.get(
					gridKey(cellX + offsetX, cellY + offsetY),
				);
				if (!nearby) continue;
				for (const position of nearby) {
					const deltaX = candidate.x - position.x;
					const deltaY = candidate.y - position.y;
					nearest = Math.min(nearest, deltaX * deltaX + deltaY * deltaY);
				}
			}
		}

		return nearest;
	};

	for (const id of ids) {
		const seed = hashString(id);
		let bestPosition: GraphPosition | null = null;
		let bestDistance = -1;

		for (
			let candidateIndex = 0;
			candidateIndex < candidateCount;
			candidateIndex += 1
		) {
			const salt = candidateIndex * 5;
			const isOutlier = randomUnit(seed, salt) < 0.02;
			let candidate: GraphPosition;

			if (isOutlier) {
				candidate = {
					x: (randomUnit(seed, salt + 1) * 2 - 1) * extent * 1.12,
					y: (randomUnit(seed, salt + 2) * 2 - 1) * extent * 0.86,
				};
			} else {
				const clusterIndex = Math.min(
					clusterCount - 1,
					Math.floor(randomUnit(seed, salt + 1) * clusterCount),
				);
				const center = clusterCenters[clusterIndex];
				if (!center) continue;
				const uniformA = Math.max(randomUnit(seed, salt + 2), 0.000001);
				const uniformB = randomUnit(seed, salt + 3);
				const magnitude = Math.min(Math.sqrt(-2 * Math.log(uniformA)), 2.8);
				const angle = uniformB * Math.PI * 2;
				candidate = {
					x: center.x + Math.cos(angle) * magnitude * center.spread,
					y: center.y + Math.sin(angle) * magnitude * center.spread,
				};
			}
			const distance = nearestDistanceSquared(candidate);
			if (distance > bestDistance) {
				bestPosition = candidate;
				bestDistance = distance;
			}
		}

		if (!bestPosition) continue;
		positions.set(id, bestPosition);
		const cellX = gridCoordinate(bestPosition.x);
		const cellY = gridCoordinate(bestPosition.y);
		const key = gridKey(cellX, cellY);
		const occupants = spatialGrid.get(key) ?? [];
		occupants.push(bestPosition);
		spatialGrid.set(key, occupants);
	}

	return positions;
}

function spaceNoteSize(weight: number, maxWeight: number, nodeCount: number) {
	if (nodeCount >= 10000) return scaledNodeSize(weight, 0.5, 2, maxWeight);
	if (nodeCount >= 5000) return scaledNodeSize(weight, 0.7, 2.5, maxWeight);
	if (nodeCount >= 2000) return scaledNodeSize(weight, 1, 3.4, maxWeight);
	if (nodeCount >= 1000) return scaledNodeSize(weight, 1.5, 4.5, maxWeight);
	if (nodeCount >= 400) return scaledNodeSize(weight, 2, 6.5, maxWeight);
	return scaledNodeSize(weight, 4, 12, maxWeight);
}

function spaceTagSize(weight: number, maxWeight: number, nodeCount: number) {
	if (nodeCount >= 10000) return scaledNodeSize(weight, 0.8, 2.8, maxWeight);
	if (nodeCount >= 5000) return scaledNodeSize(weight, 1, 3.4, maxWeight);
	if (nodeCount >= 2000) return scaledNodeSize(weight, 1.4, 4.5, maxWeight);
	if (nodeCount >= 1000) return scaledNodeSize(weight, 2, 6, maxWeight);
	if (nodeCount >= 400) return scaledNodeSize(weight, 2.8, 8, maxWeight);
	return scaledNodeSize(weight, 5, 13, maxWeight);
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
): ConnectionsGraph {
	const graph = createGraph();
	const positions = seedSpacePositions(payload);
	const nodeCount = payload.nodes.length + payload.tags.length;
	const connectionCounts = spaceConnectionCounts(payload);
	const maxConnections = maxConnectionCount(connectionCounts);

	for (const node of payload.nodes) {
		const position = positions.get(node.id) ?? { x: 1, y: 1 };
		const connectionCount = connectionCounts.get(node.id) ?? 0;
		graph.addNode(node.id, {
			x: position.x,
			y: position.y,
			label: node.title || node.id,
			size: spaceNoteSize(connectionCount, maxConnections, nodeCount),
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
			size: spaceTagSize(connectionCount, maxConnections, nodeCount),
			color: REDUCER_COLOR_PLACEHOLDER,
			kind: "tag",
			isCenter: false,
			isIsolated: connectionCount === 0,
		});
	}

	for (const [index, edge] of payload.edges.entries()) {
		const edgeId = `${edge.kind}:${edge.from_id}->${edge.to_id}:${index}`;
		const isRelationship = edge.kind === "relationship";
		graph.addEdgeWithKey(edgeId, edge.from_id, edge.to_id, {
			type: "line",
			colorRole: isRelationship ? "relationship" : "default",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: isRelationship ? 1 : 0.75,
		});
	}

	for (const [index, edge] of payload.tag_edges.entries()) {
		const edgeId = `tag:${edge.tag_id}->${edge.note_id}:${index}`;
		graph.addEdgeWithKey(edgeId, edge.tag_id, edge.note_id, {
			type: "tag-line",
			colorRole: "tag",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: 0.7,
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
				? 18
				: scaledNodeSize(connectionCount, 9, 17, maxConnections),
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
		let size = 0.9;
		if (isFromCenter) {
			colorRole = "accent";
			size = 1.4;
		} else if (isToCenter) {
			colorRole = "incoming";
			size = 1.15;
		} else if (isInternal) {
			colorRole = "internal";
		}

		graph.addEdgeWithKey(edgeId, edge.source, edge.target, {
			type: "line",
			colorRole,
			color: REDUCER_COLOR_PLACEHOLDER,
			size,
		});
	}

	for (const [index, edge] of payload.tag_edges.entries()) {
		const edgeId = `${edge.tag_id}->${edge.note_id}:tag:${index}`;
		graph.addEdgeWithKey(edgeId, edge.tag_id, edge.note_id, {
			type: "tag-line",
			colorRole: "tag",
			color: REDUCER_COLOR_PLACEHOLDER,
			size: 0.75,
		});
	}

	return graph;
}
