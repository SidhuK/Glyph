import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type Sigma from "sigma";
import type { LocalNoteConnections, SpaceConnections } from "../../lib/tauri";
import { connectionsEdgeScale, spaceNodeSizeScale } from "./connectionsDensity";
import type { ConnectionsLayout } from "./connectionsLayout";

export type ConnectionsNodeKind = "note" | "tag";
export type ConnectionsNodeRank = "hub" | "title" | "dot";
export type ConnectionsGraphVariant = "space" | "local";

export interface ConnectionsNodeAttributes {
	x: number;
	y: number;
	label: string;
	size: number;
	color: string;
	kind: ConnectionsNodeKind;
	isCenter: boolean;
	degree: number;
	rank: ConnectionsNodeRank;
	linked: boolean;
}

export interface ConnectionsEdgeAttributes {
	size: number;
	color: string;
	type: "curved";
}

export type ConnectionsGraph = Graph<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>;

export type ConnectionsSigma = Sigma<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>;

const LABEL_ALL_MAX_NODES = 300;
const LABELLED_HUB_COUNT = 40;
const REDUCER_COLOR_PLACEHOLDER = "#000000";
const LOCAL_LAYOUT_ITERATIONS = 120;
/** Local layout runs on the UI thread; large neighbourhoods get fewer, Barnes-Hut iterations. */
const LOCAL_LAYOUT_BUDGET = 24_000;
const LOCAL_BARNES_HUT_ORDER = 500;
const LOCAL_SEED_RADIUS = 100;

function createGraph(): ConnectionsGraph {
	return new Graph({ multi: true, type: "mixed" });
}

function nodeAttributes(
	position: { x: number; y: number },
	label: string,
	kind: ConnectionsNodeKind,
	extra: Partial<ConnectionsNodeAttributes> = {},
): ConnectionsNodeAttributes {
	return {
		x: position.x,
		y: position.y,
		label,
		size: 1,
		color: REDUCER_COLOR_PLACEHOLDER,
		kind,
		isCenter: false,
		degree: 0,
		rank: "dot",
		linked: false,
		...extra,
	};
}

function addEdge(
	graph: ConnectionsGraph,
	key: string,
	source: string,
	target: string,
	size: number,
) {
	if (source === target || !graph.hasNode(source) || !graph.hasNode(target)) return;
	graph.addEdgeWithKey(key, source, target, {
		size,
		color: REDUCER_COLOR_PLACEHOLDER,
		type: "curved",
	});
}

interface NodeSizing {
	readonly base: number;
	readonly step: number;
	readonly max: number;
}

const NODE_SIZING: Record<ConnectionsGraphVariant, NodeSizing> = {
	space: { base: 3, step: 2, max: 11 },
	local: { base: 4, step: 1.6, max: 10 },
};

function connectionsNodeSizeFor(variant: ConnectionsGraphVariant, degree: number) {
	const { base, step, max } = NODE_SIZING[variant];
	return Math.min(max, base + step * Math.sqrt(degree));
}

function isNoteLinked(graph: ConnectionsGraph, id: string) {
	return graph.someNeighbor(id, (_neighbor, attributes) => attributes.kind === "note");
}

function assignRanks(graph: ConnectionsGraph, variant: ConnectionsGraphVariant) {
	const sizeScale = variant === "space" ? spaceNodeSizeScale(graph.order) : 1;
	const noteIds = graph.filterNodes((_id, attributes) => attributes.kind === "note");
	const restRank: ConnectionsNodeRank =
		variant === "local" || noteIds.length <= LABEL_ALL_MAX_NODES ? "title" : "dot";
	const degrees = new Map(graph.mapNodes((id) => [id, graph.neighbors(id).length] as const));
	const degreeOf = (id: string) => degrees.get(id) ?? 0;
	const hubIds = new Set(
		variant === "local"
			? graph.filterNodes((_id, attributes) => attributes.isCenter)
			: noteIds.sort((a, b) => degreeOf(b) - degreeOf(a)).slice(0, LABELLED_HUB_COUNT),
	);
	graph.updateEachNodeAttributes((id, attributes) => {
		const degree = degreeOf(id);
		return {
			...attributes,
			degree,
			rank: hubIds.has(id) ? "hub" : restRank,
			linked: attributes.kind === "tag" || isNoteLinked(graph, id),
			size: connectionsNodeSizeFor(variant, degree) * sizeScale,
		};
	});
}

export function buildSpaceConnectionsGraph(
	payload: SpaceConnections,
	{ positions }: ConnectionsLayout,
): ConnectionsGraph {
	const graph = createGraph();
	const origin = { x: 0, y: 0 };

	for (const node of payload.nodes) {
		const position = positions.get(node.id) ?? origin;
		graph.addNode(node.id, nodeAttributes(position, node.title || node.id, "note"));
	}
	for (const tag of payload.tags) {
		const position = positions.get(tag.id) ?? origin;
		graph.addNode(tag.id, nodeAttributes(position, tag.title, "tag"));
	}

	const edgeScale = connectionsEdgeScale(payload.edges.length + payload.tag_edges.length);
	for (const [index, edge] of payload.edges.entries()) {
		const weightScale = 1 + Math.log1p(edge.weight) * 0.2;
		addEdge(
			graph,
			`${edge.kind}:${edge.from_id}->${edge.to_id}:${index}`,
			edge.from_id,
			edge.to_id,
			0.7 * edgeScale * weightScale,
		);
	}
	for (const [index, edge] of payload.tag_edges.entries()) {
		addEdge(
			graph,
			`tag:${edge.tag_id}->${edge.note_id}:${index}`,
			edge.tag_id,
			edge.note_id,
			0.55 * edgeScale,
		);
	}

	assignRanks(graph, "space");
	return graph;
}

/** Golden-angle seed spreads neighbours evenly so ForceAtlas2 settles without random jitter. */
function seedLocalPosition(index: number) {
	const radius = LOCAL_SEED_RADIUS * Math.sqrt(index + 1);
	const angle = index * Math.PI * (3 - Math.sqrt(5));
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function buildLocalConnectionsGraph(payload: LocalNoteConnections): ConnectionsGraph {
	const graph = createGraph();
	const ringIds = [
		...payload.nodes.filter((node) => !node.is_center).map((node) => node.id),
		...payload.tags.map((tag) => tag.id),
	].sort();
	const ringIndex = new Map(ringIds.map((id, index) => [id, index]));
	const positionFor = (id: string) => {
		const index = ringIndex.get(id);
		return index === undefined ? { x: 0, y: 0 } : seedLocalPosition(index);
	};

	for (const node of payload.nodes) {
		graph.addNode(
			node.id,
			nodeAttributes(positionFor(node.id), node.title || node.id, "note", {
				isCenter: node.is_center,
			}),
		);
	}
	for (const tag of payload.tags) {
		graph.addNode(tag.id, nodeAttributes(positionFor(tag.id), tag.title, "tag"));
	}

	for (const [index, edge] of payload.edges.entries()) {
		const touchesCenter = edge.source === payload.center.id || edge.target === payload.center.id;
		addEdge(
			graph,
			`${edge.source}->${edge.target}:${index}`,
			edge.source,
			edge.target,
			touchesCenter ? 1 : 0.75,
		);
	}
	for (const [index, edge] of payload.tag_edges.entries()) {
		addEdge(graph, `${edge.tag_id}->${edge.note_id}:tag:${index}`, edge.tag_id, edge.note_id, 0.7);
	}

	if (graph.order > 1) {
		forceAtlas2.assign(graph, {
			iterations: Math.max(
				10,
				Math.min(LOCAL_LAYOUT_ITERATIONS, Math.round(LOCAL_LAYOUT_BUDGET / graph.order)),
			),
			settings: {
				...forceAtlas2.inferSettings(graph),
				barnesHutOptimize: graph.order >= LOCAL_BARNES_HUT_ORDER,
			},
		});
	}
	assignRanks(graph, "local");
	return graph;
}
