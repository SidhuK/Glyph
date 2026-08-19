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
			requestId: 1,
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
				new Map(
					response.positions.map(([id, x, y]) => [id, { x, y }] as const),
				),
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

function filterSpaceConnections(
	payload: SpaceConnections,
	options: ConnectionsGraphOptions,
): SpaceConnections {
	const minimumDegree = connectionsMinimumVisibleDegree(options);
	if (minimumDegree <= 0) return payload;

	const degrees = new Map<string, number>();
	const bump = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);
	for (const node of payload.nodes) degrees.set(node.id, 0);
	for (const tag of payload.tags) degrees.set(tag.id, 0);
	for (const edge of payload.edges) {
		bump(edge.from_id);
		bump(edge.to_id);
	}
	for (const edge of payload.tag_edges) {
		bump(edge.tag_id);
		bump(edge.note_id);
	}

	const visibleIds = new Set(
		[...degrees.entries()]
			.filter(([, degree]) => degree >= minimumDegree)
			.map(([id]) => id),
	);
	const nodes = payload.nodes.filter((node) => visibleIds.has(node.id));
	const visibleNotes = new Set(nodes.map((node) => node.id));
	const tags = payload.tags.filter((tag) => visibleIds.has(tag.id));
	const tagIds = new Set(tags.map((tag) => tag.id));

	return {
		...payload,
		nodes,
		tags,
		edges: payload.edges.filter(
			(edge) => visibleNotes.has(edge.from_id) && visibleNotes.has(edge.to_id),
		),
		tag_edges: payload.tag_edges.filter(
			(edge) => visibleNotes.has(edge.note_id) && tagIds.has(edge.tag_id),
		),
	};
}

export function useSpaceConnectionsGraph(
	payload: SpaceConnections | null,
	spacePath: string,
	options: ConnectionsGraphOptions,
	dailyNotesFolder: string | null,
	weeklyNotesEnabled: boolean,
) {
	const layoutQuery = useQuery({
		queryKey: [
			"space-connections-layout",
			spacePath,
			payload?.nodes.length ?? 0,
			payload?.edges.length ?? 0,
			payload?.tags.length ?? 0,
			payload?.nodes[0]?.id ?? "",
			payload?.nodes[payload.nodes.length - 1]?.id ?? "",
			options.repelForce,
			options.linkDistance,
			options.linkStrength,
			options.centerForce,
		],
		enabled: Boolean(payload && payload.nodes.length > 0),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		queryFn: ({ signal }) => {
			if (!payload) {
				return Promise.reject(new Error("Missing connections payload"));
			}
			return layoutSpaceConnections(payload, options, signal);
		},
	});

	const filteredPayload = useMemo(
		() => (payload ? filterSpaceConnections(payload, options) : null),
		[options, payload],
	);

	const graph = useMemo<ConnectionsGraph | null>(() => {
		if (
			!filteredPayload ||
			filteredPayload.nodes.length === 0 ||
			!layoutQuery.data ||
			layoutQuery.error
		) {
			return null;
		}
		return buildSpaceConnectionsGraph(
			filteredPayload,
			layoutQuery.data,
			dailyNotesFolder,
			weeklyNotesEnabled,
		);
	}, [
		dailyNotesFolder,
		filteredPayload,
		layoutQuery.data,
		layoutQuery.error,
		weeklyNotesEnabled,
	]);

	return {
		filteredPayload,
		graph,
		layoutError: layoutQuery.error
			? layoutQuery.error instanceof Error
				? layoutQuery.error.message
				: String(layoutQuery.error)
			: "",
		layoutLoading: Boolean(
			payload && payload.nodes.length > 0 && layoutQuery.isPending,
		),
	};
}
