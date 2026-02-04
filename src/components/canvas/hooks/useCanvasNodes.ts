import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { ReactFlowInstance } from "@xyflow/react";
import { useCallback, useRef } from "react";
import { GRID_SIZE, snapPoint } from "../../../lib/canvasLayout";
import { invoke } from "../../../lib/tauri";
import type { CanvasEdge, CanvasNode } from "../types";

interface UseCanvasNodesProps {
	flowRef: React.RefObject<ReactFlowInstance<CanvasNode, CanvasEdge> | null>;
	wrapperRef: React.RefObject<HTMLDivElement | null>;
	setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
	vaultPath: string | null;
}

export function useCanvasNodes({
	flowRef,
	wrapperRef,
	setNodes,
	vaultPath,
}: UseCanvasNodesProps) {
	const nodesRef = useRef<CanvasNode[]>([]);

	const flowCenter = useCallback(() => {
		const flow = flowRef.current;
		const el = wrapperRef.current;
		if (!flow || !el) return { x: 0, y: 0 };
		const rect = el.getBoundingClientRect();
		const pos = flow.screenToFlowPosition({
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		});
		return snapPoint(pos, GRID_SIZE);
	}, [flowRef, wrapperRef]);

	const createTextNode = useCallback(() => {
		const text = window.prompt("Text node:", "Hello");
		if (text == null) return;
		setNodes((prev) => {
			const pos = flowCenter();
			return [
				...prev,
				{
					id: crypto.randomUUID(),
					type: "text",
					position: pos,
					data: { text },
				},
			];
		});
	}, [flowCenter, setNodes]);

	const createLinkNode = useCallback(
		(url: string, position?: { x: number; y: number }) => {
			if (!url) return;
			const nodeId = crypto.randomUUID();
			setNodes((prev) => {
				const pos = snapPoint(position ?? flowCenter(), GRID_SIZE);
				return [
					...prev,
					{
						id: nodeId,
						type: "link",
						position: pos,
						data: { url, status: "Loading preview…" },
					},
				];
			});
			(async () => {
				try {
					const preview = await invoke("link_preview", { url });
					const imageSrc =
						vaultPath && preview.image_cache_rel_path
							? convertFileSrc(
									await join(vaultPath, preview.image_cache_rel_path),
								)
							: null;
					setNodes((prev) =>
						prev.map((n) =>
							n.id === nodeId
								? {
										...n,
										data: {
											...(n.data ?? {}),
											url: preview.url,
											preview,
											image_src: imageSrc ?? undefined,
											status: preview.ok ? "" : "Preview unavailable",
										},
									}
								: n,
						),
					);
				} catch {
					setNodes((prev) =>
						prev.map((n) =>
							n.id === nodeId
								? {
										...n,
										data: { ...(n.data ?? {}), status: "Preview failed" },
									}
								: n,
						),
					);
				}
			})();
		},
		[flowCenter, setNodes, vaultPath],
	);

	const createNoteNode = useCallback(
		(noteId: string, title: string) => {
			setNodes((prev) => {
				if (prev.some((n) => n.id === noteId)) return prev;
				const pos = flowCenter();
				return [
					...prev,
					{
						id: noteId,
						type: "note",
						position: pos,
						data: { noteId, title },
					},
				];
			});
		},
		[flowCenter, setNodes],
	);

	const refreshLinkNode = useCallback(
		(nodeId: string, url: string) => {
			if (!url) return;
			setNodes((prev) =>
				prev.map((n) =>
					n.id === nodeId
						? { ...n, data: { ...(n.data ?? {}), status: "Refreshing…" } }
						: n,
				),
			);
			(async () => {
				try {
					const preview = await invoke("link_preview", { url, force: true });
					const imageSrc =
						vaultPath && preview.image_cache_rel_path
							? convertFileSrc(
									await join(vaultPath, preview.image_cache_rel_path),
								)
							: null;
					setNodes((prev) =>
						prev.map((n) =>
							n.id === nodeId
								? {
										...n,
										data: {
											...(n.data ?? {}),
											url: preview.url,
											preview,
											image_src: imageSrc ?? undefined,
											status: preview.ok ? "" : "Preview unavailable",
										},
									}
								: n,
						),
					);
				} catch {
					setNodes((prev) =>
						prev.map((n) =>
							n.id === nodeId
								? {
										...n,
										data: { ...(n.data ?? {}), status: "Refresh failed" },
									}
								: n,
						),
					);
				}
			})();
		},
		[setNodes, vaultPath],
	);

	return {
		nodesRef,
		flowCenter,
		createTextNode,
		createLinkNode,
		createNoteNode,
		refreshLinkNode,
	};
}
