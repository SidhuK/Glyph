import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type ConnectionsGraphOptions,
	connectionsMinimumVisibleDegree,
} from "../../lib/connectionsGraphOptions";
import type { SpaceConnections } from "../../lib/tauri";
import {
	type ConnectionsGraph,
	buildSpaceConnectionsGraph,
} from "./connectionsGraph";
import type {
	ConnectionsLayoutRequest,
	ConnectionsLayoutResponse,
	GraphPosition,
} from "./connectionsLayout";

function layoutSpaceConnections(
	payload: SpaceConnections,
	options: ConnectionsGraphOptions,
	signal: AbortSignal,
) {
	return new Promise<ReadonlyMap<string, GraphPosition>>((resolve, reject) => {
		const worker = new Worker(
			new URL("./connectionsLayout.worker.ts", import.meta.url),
			{ type: "module" },
		);
		const request: ConnectionsLayoutRequest = {
			forces: {
				repel: options.repelForce,
				linkDistance: options.linkDistance,
				linkStrength: options.linkStrength,
				center: options.centerForce,
			},
			graph: {
				nodeIds: payload.nodes.map((node) => node.id),
				tags: payload.tags.map((tag) => ({
					id: tag.id,
					noteCount: tag.note_count,
				})),
				edges: payload.edges.map((edge) => ({
					source: edge.from_id,
					target: edge.to_id,
					kind: edge.kind,
					weight: edge.weight,
				})),
				tagEdges: payload.tag_edges.map((edge) => ({
					tagId: edge.tag_id,
					noteId: edge.note_id,
				})),
			},
		};

		const abort = () => {
			worker.terminate();
			reject(new DOMException("Aborted", "AbortError"));
		};
		if (signal.aborted) {
			abort();
			return;
		}
		signal.addEventListener("abort", abort, { once: true });

		worker.onmessage = (event: MessageEvent<ConnectionsLayoutResponse>) => {
			signal.removeEventListener("abort", abort);
			worker.terminate();
			const response = event.data;
			if ("error" in response) {
				reject(new Error(response.error));
				return;
			}
			resolve(
				new Map(response.positions.map(([id, x, y]) => [id, { x, y }])),
			);
		};
		worker.onerror = (event) => {
			signal.removeEventListener("abort", abort);
			worker.terminate();
			reject(new Error(event.message || "Could not lay out connections"));
		};
		worker.postMessage(request);
	});
}

function noteLinkDegrees(payload: SpaceConnections) {
	const neighbors = new Map<string, Set<string>>();
	for (const node of payload.nodes) neighbors.set(node.id, new Set());
	for (const edge of payload.edges) {
		if (edge.from_id === edge.to_id) continue;
		neighbors.get(edge.from_id)?.add(edge.to_id);
		neighbors.get(edge.to_id)?.add(edge.from_id);
	}
	const degrees = new Map<string, number>();
	for (const [id, linked] of neighbors) degrees.set(id, linked.size);
	return degrees;
}

function filterSpaceConnections(
	payload: SpaceConnections,
	options: ConnectionsGraphOptions,
): SpaceConnections {
	const minimumDegree = connectionsMinimumVisibleDegree(options);
	if (minimumDegree <= 0) return payload;

	const degrees = noteLinkDegrees(payload);
	const nodes = payload.nodes.filter(
		(node) => (degrees.get(node.id) ?? 0) >= minimumDegree,
	);
	const visibleNotes = new Set(nodes.map((node) => node.id));
	const tag_edges = payload.tag_edges.filter((edge) =>
		visibleNotes.has(edge.note_id),
	);
	const remainingTagIds = new Set(tag_edges.map((edge) => edge.tag_id));

	return {
		...payload,
		nodes,
		tags: payload.tags.filter((tag) => remainingTagIds.has(tag.id)),
		edges: payload.edges.filter(
			(edge) => visibleNotes.has(edge.from_id) && visibleNotes.has(edge.to_id),
		),
		tag_edges,
	};
}

export function useSpaceConnectionsGraph(
	payload: SpaceConnections | null,
	spacePath: string,
	options: ConnectionsGraphOptions,
) {
	const filteredPayload = useMemo(
		() => (payload ? filterSpaceConnections(payload, options) : null),
		[options, payload],
	);

	const layoutQuery = useQuery({
		queryKey: [
			"space-connections-layout",
			"inward-pack",
			spacePath,
			filteredPayload?.nodes.length ?? 0,
			filteredPayload?.edges.length ?? 0,
			filteredPayload?.tags.length ?? 0,
			filteredPayload?.nodes[0]?.id ?? "",
			filteredPayload?.nodes[filteredPayload.nodes.length - 1]?.id ?? "",
			options.repelForce,
			options.linkDistance,
			options.linkStrength,
			options.centerForce,
		],
		enabled: Boolean(filteredPayload && filteredPayload.nodes.length > 0),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		queryFn: ({ signal }) => {
			if (!filteredPayload) {
				return Promise.reject(new Error("Missing connections payload"));
			}
			return layoutSpaceConnections(filteredPayload, options, signal);
		},
	});

	const graph = useMemo<ConnectionsGraph | null>(() => {
		if (
			!filteredPayload ||
			filteredPayload.nodes.length === 0 ||
			!layoutQuery.data ||
			layoutQuery.error
		) {
			return null;
		}
		return buildSpaceConnectionsGraph(filteredPayload, layoutQuery.data);
	}, [filteredPayload, layoutQuery.data, layoutQuery.error]);

	return {
		filteredPayload,
		graph,
		layoutError: layoutQuery.error
			? layoutQuery.error instanceof Error
				? layoutQuery.error.message
				: String(layoutQuery.error)
			: "",
		layoutLoading: Boolean(
			filteredPayload &&
				filteredPayload.nodes.length > 0 &&
				layoutQuery.isPending,
		),
	};
}
