import {
	type ConnectionsLayoutGraph,
	detectConnectionsCommunities,
} from "./connectionsCommunities";
import { placeConnectionsCommunities } from "./connectionsCommunityPlacement";
import { placeLegacyConnectionsCommunities } from "./connectionsLegacyCommunityPlacement";

export type ConnectionsLayoutMode = "bundled" | "legacy";

export interface ConnectionsLayoutRequest {
	readonly graph: ConnectionsLayoutGraph;
	readonly mode: ConnectionsLayoutMode;
}

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

export function computeSpaceConnectionsLayout({
	graph,
	mode,
}: ConnectionsLayoutRequest) {
	if (graph.nodeIds.length + graph.tags.length === 0) return [];
	const model = detectConnectionsCommunities(graph);
	return mode === "legacy"
		? placeLegacyConnectionsCommunities(model)
		: placeConnectionsCommunities(model);
}
