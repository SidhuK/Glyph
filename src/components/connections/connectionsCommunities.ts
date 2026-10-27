import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type { ConnectionsCommunity } from "./connectionsLayout";
import {
	assignTagsToBestGroup,
	connectedGroups,
	foldTinyGroups,
} from "./connectionsCommunityGroups";
import { hashString, seededRandom } from "./connectionsRandom";

const NOTE_LINK_WEIGHT = 2.5;
const RELATIONSHIP_WEIGHT = 4;
const TAG_WEIGHT_SCALE = 1.8;
const TAG_FREQUENCY_DISCOUNT = 0.72;
const LOUVAIN_RESOLUTION = 1.15;

export interface ConnectionsLayoutGraph {
	readonly nodeIds: readonly string[];
	readonly tags: readonly {
		readonly id: string;
		readonly noteCount: number;
	}[];
	readonly edges: readonly {
		readonly source: string;
		readonly target: string;
		readonly kind: "link" | "relationship";
		readonly weight: number;
	}[];
	readonly tagEdges: readonly {
		readonly tagId: string;
		readonly noteId: string;
	}[];
}

interface WeightedNodeAttributes {
	x: number;
	y: number;
	size: number;
}

interface WeightedEdgeAttributes {
	weight: number;
}

export type ConnectionsWeightedGraph = Graph<WeightedNodeAttributes, WeightedEdgeAttributes>;

interface ConnectionsCommunityModel {
	/** Undirected, merged-weight graph of every note and tag, ready for layout. */
	readonly graph: ConnectionsWeightedGraph;
	readonly communities: readonly ConnectionsCommunity[];
	/** Nodes with no links or tag edges, ordered deterministically. */
	readonly unlinkedIds: readonly string[];
}

export function createWeightedGraph(): ConnectionsWeightedGraph {
	return new Graph<WeightedNodeAttributes, WeightedEdgeAttributes>({
		type: "undirected",
		multi: false,
		allowSelfLoops: false,
	});
}

/** Adds `weight` to the edge between two existing nodes, creating it when missing. */
export function addEdgeWeight(
	graph: ConnectionsWeightedGraph,
	left: string,
	right: string,
	weight: number,
) {
	if (!graph.hasNode(left) || !graph.hasNode(right) || left === right) return;
	const existingEdge = graph.edge(left, right);
	if (existingEdge) {
		graph.updateEdgeAttribute(existingEdge, "weight", (current = 0) => current + weight);
		return;
	}
	graph.addUndirectedEdge(left, right, { weight });
}

function buildWeightedGraph(layoutGraph: ConnectionsLayoutGraph): ConnectionsWeightedGraph {
	const graph = createWeightedGraph();
	const origin = () => ({ x: 0, y: 0, size: 1 });

	for (const nodeId of layoutGraph.nodeIds) graph.mergeNode(nodeId, origin());
	for (const tag of layoutGraph.tags) graph.mergeNode(tag.id, origin());

	for (const edge of layoutGraph.edges) {
		addEdgeWeight(
			graph,
			edge.source,
			edge.target,
			(edge.kind === "relationship" ? RELATIONSHIP_WEIGHT : NOTE_LINK_WEIGHT) * edge.weight,
		);
	}

	const tagCounts = new Map(layoutGraph.tags.map((tag) => [tag.id, tag.noteCount]));
	for (const edge of layoutGraph.tagEdges) {
		const noteCount = Math.max(1, tagCounts.get(edge.tagId) ?? 1);
		addEdgeWeight(
			graph,
			edge.tagId,
			edge.noteId,
			TAG_WEIGHT_SCALE / noteCount ** TAG_FREQUENCY_DISCOUNT,
		);
	}

	return graph;
}

function internalWeightedDegree(
	nodeId: string,
	members: ReadonlySet<string>,
	graph: ConnectionsWeightedGraph,
) {
	let degree = 0;
	graph.forEachEdge(nodeId, (_edge, attributes, source, target) => {
		if (members.has(source === nodeId ? target : source)) degree += attributes.weight;
	});
	return degree;
}

/** Members sorted by internal weight; the best-linked note leads as hub, tags only when no note is in. */
function rankMembers(
	members: readonly string[],
	tagIds: ReadonlySet<string>,
	graph: ConnectionsWeightedGraph,
) {
	const memberSet = new Set(members);
	const degrees = new Map(members.map((id) => [id, internalWeightedDegree(id, memberSet, graph)]));
	const ranked = [...members].sort(
		(left, right) =>
			(degrees.get(right) ?? 0) - (degrees.get(left) ?? 0) || hashString(left) - hashString(right),
	);
	const hubId = ranked.find((id) => !tagIds.has(id)) ?? ranked[0];
	if (hubId === undefined) return ranked;
	return [hubId, ...ranked.filter((id) => id !== hubId)];
}

export function detectConnectionsCommunities(
	layoutGraph: ConnectionsLayoutGraph,
): ConnectionsCommunityModel {
	const graph = buildWeightedGraph(layoutGraph);
	const assignments =
		graph.size > 0
			? louvain(graph, {
					getEdgeWeight: "weight",
					resolution: LOUVAIN_RESOLUTION,
					rng: seededRandom(hashString("glyph-connections-communities")),
				})
			: {};
	const tagIds = new Set(layoutGraph.tags.map((tag) => tag.id));
	const owner = new Map<string, number>();
	for (const [nodeId, group] of Object.entries(assignments)) {
		if (graph.degree(nodeId) > 0) owner.set(nodeId, group);
	}
	assignTagsToBestGroup(owner, tagIds, graph);

	const { groups, loose } = foldTinyGroups(connectedGroups(owner, graph), graph);
	const noteCount = (members: readonly string[]) => members.filter((id) => !tagIds.has(id)).length;
	groups.sort(
		(left, right) =>
			noteCount(right) - noteCount(left) ||
			right.length - left.length ||
			hashString(left[0] ?? "") - hashString(right[0] ?? ""),
	);
	if (loose.length > 0) groups.push(loose);

	const communities: ConnectionsCommunity[] = [];
	for (const members of groups) {
		const memberIds = rankMembers(members, tagIds, graph);
		const [hubId] = memberIds;
		if (hubId !== undefined) communities.push({ index: communities.length, hubId, memberIds });
	}
	const unlinkedIds = graph
		.filterNodes((nodeId) => graph.degree(nodeId) === 0)
		.sort((left, right) => hashString(left) - hashString(right));

	return { graph, communities, unlinkedIds };
}
