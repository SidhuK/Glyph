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

export type ConnectionsLayoutResponse =
	| {
			positions: SerializedGraphPosition[];
	  }
	| {
			error: string;
	  };

export function computeSpaceConnectionsLayout(graph: ConnectionsLayoutGraph) {
	if (graph.nodeIds.length + graph.tags.length === 0) return [];
	return placeConnectionsCommunities(detectConnectionsCommunities(graph));
}
