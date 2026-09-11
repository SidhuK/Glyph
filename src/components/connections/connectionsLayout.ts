import {
	type ConnectionsLayoutGraph,
	detectConnectionsCommunities,
} from "./connectionsCommunities";
import { placeConnectionsCommunities } from "./connectionsCommunityPlacement";

export interface GraphPosition {
	readonly x: number;
	readonly y: number;
	readonly bundleX: number;
	readonly bundleY: number;
}

export type SerializedGraphPosition = readonly [
	id: string,
	x: number,
	y: number,
	bundleX: number,
	bundleY: number,
];

export type ConnectionsLayoutResponse =
	| {
			readonly positions: readonly SerializedGraphPosition[];
	  }
	| {
			readonly error: string;
	  };

export function computeSpaceConnectionsLayout(graph: ConnectionsLayoutGraph) {
	if (graph.nodeIds.length + graph.tags.length === 0) return [];
	return placeConnectionsCommunities(detectConnectionsCommunities(graph));
}
