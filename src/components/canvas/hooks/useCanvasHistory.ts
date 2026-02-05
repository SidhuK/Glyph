import { useCallback, useRef } from "react";
import type { CanvasEdge, CanvasNode } from "../types";

interface HistoryState {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export function useCanvasHistory(
	nodes: CanvasNode[],
	edges: CanvasEdge[],
	setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>,
	setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>,
	stripEphemeral: (n: CanvasNode[], e: CanvasEdge[]) => HistoryState,
) {
	const HISTORY_MIN_INTERVAL_MS = 120;
	const pastRef = useRef<HistoryState[]>([]);
	const futureRef = useRef<HistoryState[]>([]);
	const lastHistoryRef = useRef<string>("");
	const lastStateRef = useRef<HistoryState | null>(null);
	const applyingHistoryRef = useRef(false);
	const lastPushAtRef = useRef(0);

	const snapshotString = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) =>
			JSON.stringify({
				n: n.map((node) => ({
					id: node.id,
					type: node.type ?? null,
					position: node.position,
					data: node.data ?? null,
					parentNode: (node as unknown as { parentNode?: string | null })
						.parentNode,
					extent: (node as unknown as { extent?: unknown }).extent ?? null,
					style: (node as unknown as { style?: unknown }).style ?? null,
				})),
				e: e.map((edge) => ({
					id: edge.id,
					source: edge.source,
					target: edge.target,
					type: edge.type ?? null,
					label: (edge as unknown as { label?: unknown }).label ?? null,
					data: edge.data ?? null,
					style: (edge as unknown as { style?: unknown }).style ?? null,
				})),
			}),
		[],
	);

	const pushHistory = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => {
			if (applyingHistoryRef.current) return;
			const now = Date.now();
			if (now - lastPushAtRef.current < HISTORY_MIN_INTERVAL_MS) return;
			const stable = stripEphemeral(n, e);
			const nextKey = snapshotString(stable.nodes, stable.edges);
			if (!lastHistoryRef.current) {
				lastHistoryRef.current = nextKey;
				lastStateRef.current = structuredClone(stable);
				lastPushAtRef.current = now;
				return;
			}
			if (nextKey === lastHistoryRef.current) return;

			const prev = lastStateRef.current;
			if (prev) pastRef.current.push(prev);
			if (pastRef.current.length > 80) pastRef.current.shift();
			futureRef.current = [];
			lastHistoryRef.current = nextKey;
			lastStateRef.current = structuredClone(stable);
			lastPushAtRef.current = now;
		},
		[snapshotString, stripEphemeral],
	);

	const undo = useCallback(() => {
		const past = pastRef.current;
		if (!past.length) return;
		applyingHistoryRef.current = true;
		const previous = past.pop();
		if (!previous) return;
		futureRef.current.push(structuredClone({ nodes, edges }));
		setNodes(previous.nodes);
		setEdges(previous.edges);
		window.setTimeout(() => {
			lastHistoryRef.current = snapshotString(previous.nodes, previous.edges);
			lastStateRef.current = structuredClone(previous);
			applyingHistoryRef.current = false;
		}, 0);
	}, [edges, nodes, setEdges, setNodes, snapshotString]);

	const redo = useCallback(() => {
		const future = futureRef.current;
		if (!future.length) return;
		applyingHistoryRef.current = true;
		const next = future.pop();
		if (!next) return;
		pastRef.current.push(structuredClone({ nodes, edges }));
		setNodes(next.nodes);
		setEdges(next.edges);
		window.setTimeout(() => {
			lastHistoryRef.current = snapshotString(next.nodes, next.edges);
			lastStateRef.current = structuredClone(next);
			applyingHistoryRef.current = false;
		}, 0);
	}, [edges, nodes, setEdges, setNodes, snapshotString]);

	const resetHistory = useCallback(
		(n: CanvasNode[], e: CanvasEdge[]) => {
			pastRef.current = [];
			futureRef.current = [];
			lastHistoryRef.current = snapshotString(n, e);
			lastStateRef.current = structuredClone({ nodes: n, edges: e });
		},
		[snapshotString],
	);

	return {
		pushHistory,
		undo,
		redo,
		resetHistory,
		snapshotString,
		applyingHistoryRef,
	};
}
