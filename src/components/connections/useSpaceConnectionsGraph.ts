import { useEffect, useMemo, useRef, useState } from "react";
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

interface LayoutResult {
	source: SpaceConnections | null;
	positions: ReadonlyMap<string, GraphPosition>;
	error: string;
}

function filterSpaceConnections(
	payload: SpaceConnections,
	showUnconnectedNotes: boolean,
) {
	if (showUnconnectedNotes) return payload;

	const nodes = payload.nodes.filter((node) => !node.is_isolated);
	const visibleNodeIds = new Set(nodes.map((node) => node.id));
	return {
		...payload,
		nodes,
		edges: payload.edges.filter(
			(edge) =>
				visibleNodeIds.has(edge.from_id) && visibleNodeIds.has(edge.to_id),
		),
		tag_edges: payload.tag_edges.filter((edge) =>
			visibleNodeIds.has(edge.note_id),
		),
	};
}

export function useSpaceConnectionsGraph(
	payload: SpaceConnections | null,
	showUnconnectedNotes: boolean,
) {
	const requestIdRef = useRef(0);
	const [layoutResult, setLayoutResult] = useState<LayoutResult>({
		source: null,
		positions: new Map(),
		error: "",
	});
	const filteredPayload = useMemo(
		() =>
			payload ? filterSpaceConnections(payload, showUnconnectedNotes) : null,
		[payload, showUnconnectedNotes],
	);

	useEffect(() => {
		if (!payload || payload.nodes.length === 0) {
			setLayoutResult({
				source: payload,
				positions: new Map(),
				error: "",
			});
			return;
		}

		const requestId = ++requestIdRef.current;
		const worker = new Worker(
			new URL("./connectionsLayout.worker.ts", import.meta.url),
			{ type: "module" },
		);
		const request: ConnectionsLayoutRequest = {
			requestId,
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
				})),
				tagEdges: payload.tag_edges.map((edge) => ({
					tagId: edge.tag_id,
					noteId: edge.note_id,
				})),
			},
		};

		worker.onmessage = (event: MessageEvent<ConnectionsLayoutResponse>) => {
			const response = event.data;
			if (response.requestId !== requestId) return;
			worker.terminate();
			if ("error" in response) {
				setLayoutResult({
					source: payload,
					positions: new Map(),
					error: response.error,
				});
				return;
			}

			setLayoutResult({
				source: payload,
				positions: new Map(
					response.positions.map(([id, x, y]) => [id, { x, y }] as const),
				),
				error: "",
			});
		};
		worker.onerror = (event) => {
			worker.terminate();
			setLayoutResult({
				source: payload,
				positions: new Map(),
				error: event.message || "Could not lay out connections",
			});
		};
		worker.postMessage(request);

		return () => worker.terminate();
	}, [payload]);

	const graph = useMemo<ConnectionsGraph | null>(() => {
		if (
			!filteredPayload ||
			filteredPayload.nodes.length === 0 ||
			layoutResult.source !== payload ||
			layoutResult.error
		) {
			return null;
		}
		return buildSpaceConnectionsGraph(filteredPayload, layoutResult.positions);
	}, [filteredPayload, layoutResult, payload]);

	return {
		filteredPayload,
		graph,
		layoutError: layoutResult.source === payload ? layoutResult.error : "",
		layoutLoading: Boolean(
			payload && payload.nodes.length > 0 && layoutResult.source !== payload,
		),
	};
}
