import {
	type ConnectionsLayoutGraph,
	detectConnectionsCommunities,
} from "./connectionsCommunities";
import { NODE_SPACING, bounds, jitter, layOutClusters } from "./connectionsClusterLayout";

export interface ConnectionsCommunity {
	readonly index: number;
	/** The best-linked member; it heads `memberIds`, which runs from most to least linked. */
	readonly hubId: string;
	readonly memberIds: readonly string[];
}

interface ConnectionsNodePosition {
	readonly x: number;
	readonly y: number;
	/** Index into `ConnectionsLayout.communities`; null for unlinked notes. */
	readonly community: number | null;
}

export interface ConnectionsLayout {
	readonly positions: ReadonlyMap<string, ConnectionsNodePosition>;
	readonly communities: readonly ConnectionsCommunity[];
	readonly unlinkedIds: readonly string[];
}

type SerializedNodePosition = readonly [id: string, x: number, y: number, community: number | null];

interface SerializedConnectionsLayout {
	readonly positions: readonly SerializedNodePosition[];
	readonly communities: readonly ConnectionsCommunity[];
	readonly unlinkedIds: readonly string[];
}

export type ConnectionsLayoutResponse =
	| { readonly kind: "ready"; readonly layout: SerializedConnectionsLayout }
	| { readonly kind: "error"; readonly error: string };

/** Unlinked notes sit in an airy grid this many graph units apart, below the linked layout. */
const UNLINKED_PITCH = NODE_SPACING * 1.4;
const UNLINKED_JITTER = 0.2;

/** Parks unlinked notes in a loose grid centered under the linked layout (graph space is y-up). */
function placeUnlinked(
	unlinkedIds: readonly string[],
	linked: ReturnType<typeof bounds> | null,
): SerializedNodePosition[] {
	if (unlinkedIds.length === 0) return [];
	const width = linked ? linked.maxX - linked.minX : 0;
	const columns = Math.max(
		1,
		Math.min(
			unlinkedIds.length,
			Math.max(Math.floor(width / UNLINKED_PITCH) + 1, Math.ceil(Math.sqrt(unlinkedIds.length))),
		),
	);
	const centerX = linked ? (linked.minX + linked.maxX) / 2 : 0;
	const top = linked ? linked.minY - UNLINKED_PITCH * 2 : 0;
	const left = centerX - ((columns - 1) * UNLINKED_PITCH) / 2;
	return unlinkedIds.map((id, index) => [
		id,
		left + ((index % columns) + (jitter(id, 3) - 0.5) * UNLINKED_JITTER) * UNLINKED_PITCH,
		top - (Math.floor(index / columns) + (jitter(id, 4) - 0.5) * UNLINKED_JITTER) * UNLINKED_PITCH,
		null,
	]);
}

export function computeSpaceConnectionsLayout(
	layoutGraph: ConnectionsLayoutGraph,
): SerializedConnectionsLayout {
	const { graph, communities, unlinkedIds } = detectConnectionsCommunities(layoutGraph);
	const positions: SerializedNodePosition[] = layOutClusters(graph, communities);
	const linked = positions.length > 0 ? bounds(positions.map(([, x, y]) => ({ x, y }))) : null;
	positions.push(...placeUnlinked(unlinkedIds, linked));
	return { positions, communities, unlinkedIds };
}

export function deserializeConnectionsLayout(
	layout: SerializedConnectionsLayout,
): ConnectionsLayout {
	return {
		positions: new Map(layout.positions.map(([id, x, y, community]) => [id, { x, y, community }])),
		communities: layout.communities,
		unlinkedIds: layout.unlinkedIds,
	};
}
