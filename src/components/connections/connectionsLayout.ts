import { connectionsForceScale } from "../../lib/connectionsGraphOptions";
import {
	type ConnectionsLayoutForces,
	type ConnectionsLayoutGraph,
	detectConnectionsCommunities,
} from "./connectionsCommunities";
import { placeConnectionsCommunities } from "./connectionsCommunityPlacement";

export interface GraphPosition {
	x: number;
	y: number;
}

export type SerializedGraphPosition = readonly [
	id: string,
	x: number,
	y: number,
];

export interface ConnectionsLayoutRequest {
	requestId: number;
	graph: ConnectionsLayoutGraph;
	forces: ConnectionsLayoutForces;
}

export type ConnectionsLayoutResponse =
	| {
			requestId: number;
			positions: SerializedGraphPosition[];
	  }
	| {
			requestId: number;
			error: string;
	  };

export function computeSpaceConnectionsLayout(
	graph: ConnectionsLayoutGraph,
	forces: ConnectionsLayoutForces,
) {
	const nodeCount = graph.nodeIds.length + graph.tags.length;
	if (nodeCount === 0) return [];
	const strength = connectionsForceScale(forces.linkStrength);
	const communities = detectConnectionsCommunities({
		...graph,
		edges: graph.edges.map((edge) => ({
			...edge,
			weight: Math.max(1, edge.weight) * strength,
		})),
	});
	return placeConnectionsCommunities(communities, forces);
}
