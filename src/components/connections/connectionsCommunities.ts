import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { hashString, seededRandom } from "./connectionsRandom";

const NOTE_LINK_WEIGHT = 2.5;
const RELATIONSHIP_WEIGHT = 4;
const TAG_WEIGHT_SCALE = 1.8;
const TAG_FREQUENCY_DISCOUNT = 0.72;
const LOUVAIN_RESOLUTION = 1.15;

interface CommunityGraphNodeAttributes {
	kind: "note" | "tag";
}

interface CommunityGraphEdgeAttributes {
	weight: number;
}

export interface ConnectionsLayoutGraph {
	nodeIds: string[];
	tags: Array<{ id: string; noteCount: number }>;
	edges: Array<{
		source: string;
		target: string;
		kind: "link" | "relationship";
	}>;
	tagEdges: Array<{ tagId: string; noteId: string }>;
}

export interface ConnectionsCommunity {
	id: number;
	members: string[];
	hubId: string;
	radius: number;
}

export interface ConnectionsCommunityModel {
	adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>;
	communities: ConnectionsCommunity[];
	communityBridges: ReadonlyMap<string, number>;
}

function communityPairKey(left: number, right: number) {
	return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function addAdjacencyWeight(
	adjacency: Map<string, Map<string, number>>,
	left: string,
	right: string,
	weight: number,
) {
	const leftNeighbors = adjacency.get(left);
	const rightNeighbors = adjacency.get(right);
	if (!leftNeighbors || !rightNeighbors || left === right) return;
	leftNeighbors.set(right, (leftNeighbors.get(right) ?? 0) + weight);
	rightNeighbors.set(left, (rightNeighbors.get(left) ?? 0) + weight);
}

function buildWeightedGraph(layoutGraph: ConnectionsLayoutGraph) {
	const graph = new Graph<
		CommunityGraphNodeAttributes,
		CommunityGraphEdgeAttributes
	>({ type: "undirected", multi: false, allowSelfLoops: false });
	const adjacency = new Map<string, Map<string, number>>();

	for (const nodeId of layoutGraph.nodeIds) {
		graph.addNode(nodeId, { kind: "note" });
		adjacency.set(nodeId, new Map());
	}
	for (const tag of layoutGraph.tags) {
		graph.addNode(tag.id, { kind: "tag" });
		adjacency.set(tag.id, new Map());
	}

	const mergeEdge = (left: string, right: string, weight: number) => {
		if (!graph.hasNode(left) || !graph.hasNode(right) || left === right) return;
		const existingEdge = graph.edge(left, right);
		if (existingEdge) {
			graph.updateEdgeAttribute(
				existingEdge,
				"weight",
				(current = 0) => current + weight,
			);
		} else {
			graph.addUndirectedEdge(left, right, { weight });
		}
		addAdjacencyWeight(adjacency, left, right, weight);
	};

	for (const edge of layoutGraph.edges) {
		mergeEdge(
			edge.source,
			edge.target,
			edge.kind === "relationship" ? RELATIONSHIP_WEIGHT : NOTE_LINK_WEIGHT,
		);
	}

	const tagCounts = new Map(
		layoutGraph.tags.map((tag) => [tag.id, tag.noteCount]),
	);
	for (const edge of layoutGraph.tagEdges) {
		const noteCount = Math.max(1, tagCounts.get(edge.tagId) ?? 1);
		mergeEdge(
			edge.tagId,
			edge.noteId,
			TAG_WEIGHT_SCALE / noteCount ** TAG_FREQUENCY_DISCOUNT,
		);
	}

	return { adjacency, graph };
}

function splitDisconnectedCommunities(
	assignments: Readonly<Record<string, number>>,
	adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>,
) {
	const groups = new Map<number, Set<string>>();
	for (const [nodeId, communityId] of Object.entries(assignments)) {
		const members = groups.get(communityId) ?? new Set<string>();
		members.add(nodeId);
		groups.set(communityId, members);
	}

	const components: string[][] = [];
	const isolated: string[] = [];
	for (const members of groups.values()) {
		const remaining = new Set(members);
		while (remaining.size > 0) {
			const first = remaining.values().next().value;
			if (typeof first !== "string") break;
			remaining.delete(first);
			const component = [first];
			for (let index = 0; index < component.length; index += 1) {
				const current = component[index];
				if (!current) continue;
				for (const neighbor of adjacency.get(current)?.keys() ?? []) {
					if (!members.has(neighbor) || !remaining.delete(neighbor)) continue;
					component.push(neighbor);
				}
			}
			if (component.length === 1 && (adjacency.get(first)?.size ?? 0) === 0) {
				isolated.push(first);
			} else {
				components.push(component);
			}
		}
	}

	for (const nodeId of isolated) components.push([nodeId]);
	return components;
}

function internalWeightedDegree(
	nodeId: string,
	members: ReadonlySet<string>,
	adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>,
) {
	let degree = 0;
	for (const [neighbor, weight] of adjacency.get(nodeId) ?? []) {
		if (members.has(neighbor)) degree += weight;
	}
	return degree;
}

export function detectConnectionsCommunities(
	layoutGraph: ConnectionsLayoutGraph,
): ConnectionsCommunityModel {
	const { adjacency, graph } = buildWeightedGraph(layoutGraph);
	const assignments =
		graph.size > 0
			? louvain(graph, {
					getEdgeWeight: "weight",
					resolution: LOUVAIN_RESOLUTION,
					rng: seededRandom(hashString("glyph-connections-communities")),
				})
			: Object.fromEntries(graph.nodes().map((id, index) => [id, index]));
	const components = splitDisconnectedCommunities(assignments, adjacency);
	components.sort((left, right) => {
		if (left.length !== right.length) return right.length - left.length;
		return hashString(left[0] ?? "") - hashString(right[0] ?? "");
	});

	const nodeCommunity = new Map<string, number>();
	const communities = components.map((members, id) => {
		const memberSet = new Set(members);
		members.sort((left, right) => {
			const degreeDifference =
				internalWeightedDegree(right, memberSet, adjacency) -
				internalWeightedDegree(left, memberSet, adjacency);
			return degreeDifference || hashString(left) - hashString(right);
		});
		for (const member of members) nodeCommunity.set(member, id);
		return {
			id,
			members,
			hubId: members[0] ?? "",
			radius: Math.max(210, Math.sqrt(members.length) * 118),
		};
	});

	const communityBridges = new Map<string, number>();
	for (const [nodeId, neighbors] of adjacency) {
		const sourceCommunity = nodeCommunity.get(nodeId);
		if (sourceCommunity === undefined) continue;
		for (const [neighbor, weight] of neighbors) {
			if (nodeId >= neighbor) continue;
			const targetCommunity = nodeCommunity.get(neighbor);
			if (
				targetCommunity === undefined ||
				sourceCommunity === targetCommunity
			) {
				continue;
			}
			const key = communityPairKey(sourceCommunity, targetCommunity);
			communityBridges.set(key, (communityBridges.get(key) ?? 0) + weight);
		}
	}

	return { adjacency, communities, communityBridges };
}

export function communityBridgeKey(left: number, right: number) {
	return communityPairKey(left, right);
}
