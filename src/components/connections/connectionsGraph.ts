import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type Sigma from "sigma";
import type { LocalNoteConnections, SpaceConnections } from "../../lib/tauri";
import { connectionsEdgeScale, spaceNodeSizeScale } from "./connectionsDensity";
import type { ConnectionsCommunity, ConnectionsLayout } from "./connectionsLayout";

export type ConnectionsNodeKind = "note" | "tag";
/** Hubs carry a bold title, titles show at rest, dots are labelled only on demand. */
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
	/** Index into the graph's `communities`; null for unlinked notes and local graphs. */
	community: number | null;
	unlinked: boolean;
}

export interface ConnectionsEdgeAttributes {
	size: number;
	color: string;
	type: "curved";
}

export interface ConnectionsGraphAttributes {
	communities: readonly ConnectionsCommunity[];
}

export type ConnectionsGraph = Graph<
	ConnectionsNodeAttributes,
	ConnectionsEdgeAttributes,
	ConnectionsGraphAttributes
>;

export type ConnectionsSigma = Sigma<
	ConnectionsNodeAttributes,
	ConnectionsEdgeAttributes,
	ConnectionsGraphAttributes
>;

const TITLE_MIN_DEGREE = 3;
const REDUCER_COLOR_PLACEHOLDER = "#000000";
const LOCAL_LAYOUT_ITERATIONS = 120;
const LOCAL_SEED_RADIUS = 100;

function createGraph(communities: readonly ConnectionsCommunity[]): ConnectionsGraph {
	const graph: ConnectionsGraph = new Graph({ multi: true, type: "mixed" });
	graph.replaceAttributes({ communities });
	return graph;
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
		community: null,
		unlinked: false,
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

/** Degree counts distinct neighbours; rank and size follow from it once every edge exists. */
function assignRanks(
	graph: ConnectionsGraph,
	variant: ConnectionsGraphVariant,
	isHub: (id: string, attributes: ConnectionsNodeAttributes) => boolean,
) {
	const sizeScale = variant === "space" ? spaceNodeSizeScale(graph.order) : 1;
	graph.updateEachNodeAttributes((id, attributes) => {
		const degree = graph.neighbors(id).length;
		const rank: ConnectionsNodeRank = isHub(id, attributes)
			? "hub"
			: degree >= TITLE_MIN_DEGREE
				? "title"
				: "dot";
		return {
			...attributes,
			degree,
			rank,
			size: connectionsNodeSizeFor(variant, rank, degree) * sizeScale,
		};
	});
}

const NODE_BASE_SIZE: Record<ConnectionsGraphVariant, Record<ConnectionsNodeRank, number>> = {
	space: { hub: 3.4, title: 2.8, dot: 2.2 },
	local: { hub: 5.5, title: 4.2, dot: 3.4 },
};

function connectionsNodeSizeFor(
	variant: ConnectionsGraphVariant,
	rank: ConnectionsNodeRank,
	degree: number,
) {
	return NODE_BASE_SIZE[variant][rank] + Math.min(0.8, Math.sqrt(degree) * 0.12);
}

export function buildSpaceConnectionsGraph(
	payload: SpaceConnections,
	{ positions, communities, unlinkedIds }: ConnectionsLayout,
): ConnectionsGraph {
	const graph = createGraph(communities);
	const unlinked = new Set(unlinkedIds);
	const hubIds = new Set(communities.map((community) => community.hubId));
	const nodeExtra = (id: string): Partial<ConnectionsNodeAttributes> => ({
		community: positions.get(id)?.community ?? null,
		unlinked: unlinked.has(id),
	});
	const origin = { x: 0, y: 0 };

	for (const node of payload.nodes) {
		const position = positions.get(node.id) ?? origin;
		graph.addNode(
			node.id,
			nodeAttributes(position, node.title || node.id, "note", nodeExtra(node.id)),
		);
	}
	for (const tag of payload.tags) {
		const position = positions.get(tag.id) ?? origin;
		graph.addNode(tag.id, nodeAttributes(position, tag.title, "tag", nodeExtra(tag.id)));
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

	assignRanks(graph, "space", (id) => hubIds.has(id));
	return graph;
}

/** Golden-angle seed spreads neighbours evenly so ForceAtlas2 settles without random jitter. */
function seedLocalPosition(index: number) {
	const radius = LOCAL_SEED_RADIUS * Math.sqrt(index + 1);
	const angle = index * Math.PI * (3 - Math.sqrt(5));
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function buildLocalConnectionsGraph(payload: LocalNoteConnections): ConnectionsGraph {
	const graph = createGraph([]);
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
			iterations: LOCAL_LAYOUT_ITERATIONS,
			settings: forceAtlas2.inferSettings(graph),
		});
	}
	assignRanks(graph, "local", (_id, attributes) => attributes.isCenter);
	return graph;
}
