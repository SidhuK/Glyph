import forceAtlas2 from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import {
	type ConnectionsWeightedGraph,
	addEdgeWeight,
	createWeightedGraph,
} from "./connectionsCommunities";
import type { ConnectionsCommunity } from "./connectionsLayout";
import { hashString, randomUnit } from "./connectionsRandom";

/** Graph units per node; a cluster's area grows with its member count so density stays even. */
export const NODE_SPACING = 12;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Hubs claim more room in the overlap pass because their titles render larger. */
const BASE_NODE_RADIUS = 1.5;
const DEGREE_RADIUS_SCALE = 0.9;
const MAX_NODE_RADIUS = 9;
const NOVERLAP_MARGIN = 1.5;
const NOVERLAP_ITERATIONS = 60;
const BARNES_HUT_MIN_ORDER = 800;
/** Whitespace between neighbouring clusters: a fixed margin plus a share of their radii. */
const CLUSTER_GAP = NODE_SPACING * 2;
const CLUSTER_GAP_SHARE = 0.2;
const CLUSTER_ITERATIONS = 300;
const CLUSTER_NOVERLAP_ITERATIONS = 200;

interface Point {
	readonly x: number;
	readonly y: number;
}

/** A community laid out around its own origin; `radius` bounds every member's dot. */
interface LocalCluster {
	readonly points: ReadonlyMap<string, Point>;
	readonly radius: number;
}

/** Fewer iterations as a cluster grows, so 5,000+ notes still lay out in a couple of seconds. */
function forceIterations(order: number) {
	return Math.max(80, Math.min(600, Math.round(6_000 / Math.sqrt(order))));
}

export function jitter(id: string, salt: number) {
	return randomUnit(hashString(id), salt);
}

function settle(graph: ConnectionsWeightedGraph, iterations: number, adjustSizes: boolean) {
	forceAtlas2.assign(graph, {
		iterations,
		getEdgeWeight: "weight",
		settings: {
			...forceAtlas2.inferSettings(graph),
			adjustSizes,
			barnesHutOptimize: graph.order >= BARNES_HUT_MIN_ORDER,
		},
	});
}

export function bounds(points: Iterable<Point>) {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const { x, y } of points) {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	return { minX, minY, maxX, maxY };
}

/** Centres the graph and, when `extent` is set, rescales its longer side to that many units. */
function centerAndScale(graph: ConnectionsWeightedGraph, extent: number | null) {
	const { minX, minY, maxX, maxY } = bounds(graph.mapNodes((_id, attributes) => attributes));
	const current = Math.max(maxX - minX, maxY - minY);
	const scale = extent !== null && current > 0 ? extent / current : 1;
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	graph.updateEachNodeAttributes((_id, attributes) => ({
		...attributes,
		x: (attributes.x - centerX) * scale,
		y: (attributes.y - centerY) * scale,
	}));
}

/** Lays out one community on intra-community edges only, so hubs elsewhere can't drag it. */
function layOutCommunity(
	graph: ConnectionsWeightedGraph,
	memberIds: readonly string[],
): LocalCluster {
	const cluster = createWeightedGraph();
	const seedRadius = NODE_SPACING * Math.sqrt(memberIds.length);
	for (const id of memberIds) {
		const angle = jitter(id, 1) * Math.PI * 2;
		const radius = seedRadius * Math.sqrt(jitter(id, 2));
		cluster.addNode(id, {
			x: Math.cos(angle) * radius,
			y: Math.sin(angle) * radius,
			size: Math.min(
				MAX_NODE_RADIUS,
				BASE_NODE_RADIUS + Math.sqrt(graph.degree(id)) * DEGREE_RADIUS_SCALE,
			),
		});
	}
	for (const id of memberIds) {
		graph.forEachEdge(id, (_edge, { weight }, source, target) => {
			const other = source === id ? target : source;
			if (id < other && cluster.hasNode(other)) cluster.addUndirectedEdge(id, other, { weight });
		});
	}
	if (cluster.order > 1) {
		settle(cluster, forceIterations(cluster.order), false);
		centerAndScale(cluster, NODE_SPACING * Math.sqrt(cluster.order) * 2);
		noverlap.assign(cluster, {
			maxIterations: NOVERLAP_ITERATIONS,
			settings: { margin: NOVERLAP_MARGIN, ratio: 1 },
		});
	}
	centerAndScale(cluster, null);

	const points = new Map<string, Point>();
	let radius = 0;
	cluster.forEachNode((id, { x, y, size }) => {
		points.set(id, { x, y });
		radius = Math.max(radius, Math.hypot(x, y) + size);
	});
	return { points, radius };
}

function clusterGap(left: number, right: number) {
	return left + right + CLUSTER_GAP + (left + right) * CLUSTER_GAP_SHARE;
}

/**
 * Places each cluster as a disc: ForceAtlas2 on the cluster graph (weighted by cross-cluster links)
 * keeps related clusters near each other, then a uniform rescale makes the tightest pair just
 * clear `clusterGap`, so no two discs overlap.
 */
function placeClusters(graph: ConnectionsWeightedGraph, clusters: readonly LocalCluster[]) {
	const owner = new Map<string, string>();
	clusters.forEach(({ points }, index) => {
		for (const id of points.keys()) owner.set(id, String(index));
	});
	const discs = createWeightedGraph();
	const spread = Math.sqrt(
		clusters.reduce((sum, { radius }) => sum + (radius + CLUSTER_GAP) ** 2, 0),
	);
	clusters.forEach(({ radius }, index) => {
		const distance = spread * Math.sqrt((index + 0.5) / clusters.length);
		discs.addNode(String(index), {
			x: Math.cos(index * GOLDEN_ANGLE) * distance,
			y: Math.sin(index * GOLDEN_ANGLE) * distance,
			size: radius,
		});
	});
	graph.forEachEdge((_edge, { weight }, source, target) => {
		const left = owner.get(source);
		const right = owner.get(target);
		if (left !== undefined && right !== undefined) addEdgeWeight(discs, left, right, weight);
	});
	if (discs.order > 1) {
		settle(discs, CLUSTER_ITERATIONS, true);
		noverlap.assign(discs, {
			maxIterations: CLUSTER_NOVERLAP_ITERATIONS,
			settings: { margin: CLUSTER_GAP, ratio: 1 },
		});
	}

	const centers = discs.mapNodes((_id, { x, y, size }) => ({ x, y, size }));
	let scale = 0;
	for (let left = 0; left < centers.length; left += 1) {
		for (let right = left + 1; right < centers.length; right += 1) {
			const a = centers[left];
			const b = centers[right];
			if (!a || !b) continue;
			const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), Number.EPSILON);
			scale = Math.max(scale, clusterGap(a.size, b.size) / distance);
		}
	}
	return centers.map(({ x, y }) => ({ x: x * (scale || 1), y: y * (scale || 1) }));
}

/**
 * Lays out every community in its own disc and returns `[id, x, y, community]` rows, turned a
 * quarter turn when portrait so the result fills the usually wider-than-tall canvas.
 */
export function layOutClusters(
	graph: ConnectionsWeightedGraph,
	communities: readonly ConnectionsCommunity[],
) {
	const clusters = communities.map(({ memberIds }) => layOutCommunity(graph, memberIds));
	const centers = placeClusters(graph, clusters);
	const rows: [id: string, x: number, y: number, community: number][] = [];
	clusters.forEach(({ points }, index) => {
		const center = centers[index] ?? { x: 0, y: 0 };
		for (const [id, { x, y }] of points) rows.push([id, center.x + x, center.y + y, index]);
	});
	const { minX, minY, maxX, maxY } = bounds(rows.map(([, x, y]) => ({ x, y })));
	if (maxY - minY <= maxX - minX) return rows;
	return rows.map(([id, x, y, community]): (typeof rows)[number] => [id, y, -x, community]);
}
