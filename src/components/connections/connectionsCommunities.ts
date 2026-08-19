import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { hashString, seededRandom } from "./connectionsRandom";

const NOTE_LINK_WEIGHT = 2.5;
const RELATIONSHIP_WEIGHT = 4;
const TAG_WEIGHT_SCALE = 1.8;
const TAG_FREQUENCY_DISCOUNT = 0.72;
const LOUVAIN_RESOLUTION = 1.15;

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
		weight: number;
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
	communities: ConnectionsCommunity[];
	communityBridges: ReadonlyMap<string, number>;
}

export function communityBridgeKey(left: number, right: number) {
	return left < right ? `${left}:${right}` : `${right}:${left}`;
}

type CommunityGraph = Graph<
	Record<string, never>,
	CommunityGraphEdgeAttributes
>;

function buildWeightedGraph(layoutGraph: ConnectionsLayoutGraph) {
	const graph = new Graph<
		Record<string, never>,
		CommunityGraphEdgeAttributes
	>({
		type: "undirected",
		multi: false,
		allowSelfLoops: false,
	});

	for (const nodeId of layoutGraph.nodeIds) graph.addNode(nodeId);
	for (const tag of layoutGraph.tags) graph.addNode(tag.id);

	const mergeEdge = (left: string, right: string, weight: number) => {
		if (!graph.hasNode(left) || !graph.hasNode(right) || left === right) return;
		const existingEdge = graph.edge(left, right);
		if (existingEdge) {
			graph.updateEdgeAttribute(
				existingEdge,
				"weight",
				(current = 0) => current + weight,
			);
			return;
		}
		graph.addUndirectedEdge(left, right, { weight });
	};

	for (const edge of layoutGraph.edges) {
		mergeEdge(
			edge.source,
			edge.target,
			(edge.kind === "relationship" ? RELATIONSHIP_WEIGHT : NOTE_LINK_WEIGHT) *
				edge.weight,
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

	return graph;
}

function splitDisconnectedCommunities(
	assignments: Readonly<Record<string, number>>,
	graph: CommunityGraph,
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
				for (const neighbor of graph.neighbors(current)) {
					if (!members.has(neighbor) || !remaining.delete(neighbor)) continue;
					component.push(neighbor);
				}
			}
			if (component.length === 1 && graph.degree(first) === 0) {
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
	graph: CommunityGraph,
) {
	let degree = 0;
	graph.forEachEdge(nodeId, (_edge, attributes, source, target) => {
		const neighbor = source === nodeId ? target : source;
		if (members.has(neighbor)) degree += attributes.weight;
	});
	return degree;
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
			: Object.fromEntries(graph.nodes().map((id, index) => [id, index]));
	const components = splitDisconnectedCommunities(assignments, graph);
	components.sort((left, right) => {
		if (left.length !== right.length) return right.length - left.length;
		return hashString(left[0] ?? "") - hashString(right[0] ?? "");
	});

	const nodeCommunity = new Map<string, number>();
	const communities = components.map((members, id) => {
		const memberSet = new Set(members);
		members.sort((left, right) => {
			const degreeDifference =
				internalWeightedDegree(right, memberSet, graph) -
				internalWeightedDegree(left, memberSet, graph);
			return degreeDifference || hashString(left) - hashString(right);
		});
		for (const member of members) nodeCommunity.set(member, id);
		return {
			id,
			members,
			hubId: members[0] ?? "",
			radius: Math.max(18, 18 * Math.sqrt(members.length / Math.PI) * 1.15),
		};
	});

	const communityBridges = new Map<string, number>();
	graph.forEachEdge((_edge, attributes, source, target) => {
		const sourceCommunity = nodeCommunity.get(source);
		const targetCommunity = nodeCommunity.get(target);
		if (
			sourceCommunity === undefined ||
			targetCommunity === undefined ||
			sourceCommunity === targetCommunity
		) {
			return;
		}
		const key = communityBridgeKey(sourceCommunity, targetCommunity);
		communityBridges.set(
			key,
			(communityBridges.get(key) ?? 0) + attributes.weight,
		);
	});

	return { communities, communityBridges };
}
