import {
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

export function computeSpaceConnectionsLayout(graph: ConnectionsLayoutGraph) {
	const nodeCount = graph.nodeIds.length + graph.tags.length;
	if (nodeCount === 0) return [];
	const communities = detectConnectionsCommunities(graph);
	return placeConnectionsCommunities(communities, nodeCount);
}
