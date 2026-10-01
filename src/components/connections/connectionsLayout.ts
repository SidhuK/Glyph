import {
	type ConnectionsCommunityTone,
	type ConnectionsLayoutGraph,
	detectConnectionsCommunities,
} from "./connectionsCommunities";
import { placeConnectionsCommunities } from "./connectionsCommunityPlacement";

export interface GraphPosition {
	readonly x: number;
	readonly y: number;
	readonly bundleX: number;
	readonly bundleY: number;
	/** Index into `ConnectionsLayout.communities`. */
	readonly community: number;
}

export type SerializedGraphPosition = readonly [
	id: string,
	x: number,
	y: number,
	bundleX: number,
	bundleY: number,
	community: number,
];

/** A contiguous arc of the ring owned by one community, in graph-space radians. */
export type ConnectionsCommunityLayout = {
	readonly startAngle: number;
	readonly endAngle: number;
} & (
	| { readonly kind: "cluster"; readonly hubId: string; readonly tone: ConnectionsCommunityTone }
	| { readonly kind: "isolated" }
);

export interface SerializedConnectionsLayout {
	readonly positions: readonly SerializedGraphPosition[];
	readonly communities: readonly ConnectionsCommunityLayout[];
}

export interface ConnectionsLayout {
	readonly positions: ReadonlyMap<string, GraphPosition>;
	readonly communities: readonly ConnectionsCommunityLayout[];
}

export type ConnectionsLayoutResponse =
	| { readonly kind: "ready"; readonly layout: SerializedConnectionsLayout }
	| { readonly kind: "error"; readonly error: string };

export function computeSpaceConnectionsLayout(
	graph: ConnectionsLayoutGraph,
): SerializedConnectionsLayout {
	if (graph.nodeIds.length + graph.tags.length === 0) return { positions: [], communities: [] };
	return placeConnectionsCommunities(detectConnectionsCommunities(graph));
}

export function deserializeConnectionsLayout(
	layout: SerializedConnectionsLayout,
): ConnectionsLayout {
	return {
		positions: new Map(
			layout.positions.map(([id, x, y, bundleX, bundleY, community]) => [
				id,
				{ x, y, bundleX, bundleY, community },
			]),
		),
		communities: layout.communities,
	};
}
