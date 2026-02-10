import { useCallback } from "react";
import { GRID_GAP, GRID_SIZE, columnsForMaxRows, computeGridPositions } from "../../../lib/canvasLayout";
import { invoke } from "../../../lib/tauri";
import type { CanvasNode } from "../types";

interface UseCanvasToolbarActionsProps {
	nodes: CanvasNode[];
	setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
	findDropPosition: () => { x: number; y: number };
	vaultPath: string | null;
}

function previewImageSrc(
	vaultPath: string | null,
	preview: { image_cache_rel_path?: string | null; image_url?: string | null },
): string {
	if (preview.image_cache_rel_path && vaultPath) {
		return `asset://${vaultPath}/.lattice/cache/${preview.image_cache_rel_path}`;
	}
	return preview.image_url ?? "";
}

export function useCanvasToolbarActions({
	nodes,
	setNodes,
	findDropPosition,
	vaultPath,
}: UseCanvasToolbarActionsProps) {
	const handleAddLinkNode = useCallback(
		async (url?: string) => {
			const input = url ?? prompt("Enter URL:") ?? "";
			if (!input) return;
			const pos = findDropPosition();
			const nodeId = crypto.randomUUID();
			setNodes((prev) => [
				...prev,
				{
					id: nodeId,
					type: "link",
					position: pos,
					data: { url: input, status: "Loading…" },
				},
			]);
			try {
				const preview = await invoke("link_preview", { url: input });
				setNodes((prev) =>
					prev.map((n) =>
						n.id === nodeId
							? {
									...n,
									data: {
										...n.data,
										preview,
										status: preview.ok ? "" : "Failed to load preview",
										image_src: previewImageSrc(vaultPath, preview),
									},
								}
							: n,
					),
				);
			} catch {
				setNodes((prev) =>
					prev.map((n) =>
						n.id === nodeId
							? { ...n, data: { ...n.data, status: "Failed to load" } }
							: n,
					),
				);
			}
		},
		[findDropPosition, setNodes, vaultPath],
	);

	const handleReflowGrid = useCallback(() => {
		const tightGapX = Math.max(GRID_SIZE, GRID_GAP - GRID_SIZE * 2);
		const tightGapY = GRID_SIZE * 2;
		const columns = columnsForMaxRows(nodes.length);
		const positions = computeGridPositions(nodes, {
			columns,
			paddingX: tightGapX,
			paddingY: tightGapY,
			safetyPxX: Math.max(8, Math.round(GRID_SIZE * 0.35)),
			safetyPxY: Math.max(0, Math.round(GRID_SIZE * 0.1)),
		});
		setNodes((prev) =>
			prev.map((n) => {
				const pos = positions.get(n.id);
				return pos ? { ...n, position: pos } : n;
			}),
		);
	}, [nodes, setNodes]);

	return {
		handleAddLinkNode,
		handleReflowGrid,
	};
}
