import { useCallback } from "react";
import { computeGridPositions, snapPoint } from "../../../lib/canvasLayout";
import { invoke } from "../../../lib/tauri";
import type { CanvasNode } from "../types";

export type AlignMode =
	| "left"
	| "right"
	| "top"
	| "bottom"
	| "centerX"
	| "centerY";

interface UseCanvasToolbarActionsProps {
	nodes: CanvasNode[];
	selectedNodeIds: Set<string>;
	setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
	findDropPosition: () => { x: number; y: number };
	snapToGrid: boolean;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	vaultPath: string | null;
}

function previewImageSrc(
	vaultPath: string | null,
	preview: { image_cache_rel_path?: string | null; image_url?: string | null },
): string {
	if (preview.image_cache_rel_path && vaultPath) {
		return `asset://${vaultPath}/.tether/cache/${preview.image_cache_rel_path}`;
	}
	return preview.image_url ?? "";
}

export function useCanvasToolbarActions({
	nodes,
	selectedNodeIds,
	setNodes,
	findDropPosition,
	snapToGrid,
	activeNoteId,
	activeNoteTitle,
	vaultPath,
}: UseCanvasToolbarActionsProps) {
	const handleAddTextNode = useCallback(() => {
		const text = prompt("Enter text:");
		if (!text) return;
		const pos = findDropPosition();
		setNodes((prev) => [
			...prev,
			{ id: crypto.randomUUID(), type: "text", position: pos, data: { text } },
		]);
	}, [findDropPosition, setNodes]);

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

	const handleAddCurrentNote = useCallback(() => {
		if (!activeNoteId) return;
		const existing = nodes.find(
			(n) =>
				n.type === "note" &&
				(n.data as Record<string, unknown>)?.noteId === activeNoteId,
		);
		if (existing) return;
		const pos = findDropPosition();
		setNodes((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				type: "note",
				position: pos,
				data: {
					noteId: activeNoteId,
					title: activeNoteTitle ?? "Note",
					content: "",
				},
			},
		]);
	}, [activeNoteId, activeNoteTitle, nodes, findDropPosition, setNodes]);

	const handleRefreshLink = useCallback(async () => {
		const selectedLinks = nodes.filter(
			(n) => selectedNodeIds.has(n.id) && n.type === "link",
		);
		for (const node of selectedLinks) {
			const url = (node.data as Record<string, unknown>)?.url;
			if (typeof url !== "string") continue;
			setNodes((prev) =>
				prev.map((n) =>
					n.id === node.id
						? { ...n, data: { ...n.data, status: "Refreshing…" } }
						: n,
				),
			);
			try {
				const preview = await invoke("link_preview", { url, force: true });
				setNodes((prev) =>
					prev.map((n) =>
						n.id === node.id
							? {
									...n,
									data: {
										...n.data,
										preview,
										status: preview.ok ? "" : "Failed",
										image_src: previewImageSrc(vaultPath, preview),
									},
								}
							: n,
					),
				);
			} catch {
				setNodes((prev) =>
					prev.map((n) =>
						n.id === node.id
							? { ...n, data: { ...n.data, status: "Failed" } }
							: n,
					),
				);
			}
		}
	}, [nodes, selectedNodeIds, setNodes, vaultPath]);

	const handleFrameSelection = useCallback(() => {
		const selected = nodes.filter((n) => selectedNodeIds.has(n.id));
		if (!selected.length) return;
		const minX = Math.min(...selected.map((n) => n.position.x));
		const minY = Math.min(...selected.map((n) => n.position.y));
		const maxX = Math.max(...selected.map((n) => n.position.x + 200));
		const maxY = Math.max(...selected.map((n) => n.position.y + 140));
		const padding = 32;
		setNodes((prev) => [
			{
				id: crypto.randomUUID(),
				type: "frame",
				position: { x: minX - padding, y: minY - padding },
				data: {
					title: "Frame",
					width: maxX - minX + padding * 2,
					height: maxY - minY + padding * 2,
				},
			},
			...prev,
		]);
	}, [nodes, selectedNodeIds, setNodes]);

	const handleReflowGrid = useCallback(() => {
		const positions = computeGridPositions(nodes);
		setNodes((prev) =>
			prev.map((n) => {
				const pos = positions.get(n.id);
				return pos ? { ...n, position: pos } : n;
			}),
		);
	}, [nodes, setNodes]);

	const handleAlign = useCallback(
		(mode: AlignMode) => {
			const selected = nodes.filter((n) => selectedNodeIds.has(n.id));
			if (selected.length < 2) return;
			let target: number;
			switch (mode) {
				case "left":
					target = Math.min(...selected.map((n) => n.position.x));
					break;
				case "right":
					target = Math.max(...selected.map((n) => n.position.x));
					break;
				case "top":
					target = Math.min(...selected.map((n) => n.position.y));
					break;
				case "bottom":
					target = Math.max(...selected.map((n) => n.position.y));
					break;
				case "centerX":
					target =
						selected.reduce((sum, n) => sum + n.position.x, 0) /
						selected.length;
					break;
				case "centerY":
					target =
						selected.reduce((sum, n) => sum + n.position.y, 0) /
						selected.length;
					break;
			}
			setNodes((prev) =>
				prev.map((n) => {
					if (!selectedNodeIds.has(n.id)) return n;
					const pos = { ...n.position };
					if (mode === "left" || mode === "right" || mode === "centerX") {
						pos.x = target;
					} else {
						pos.y = target;
					}
					return { ...n, position: snapToGrid ? snapPoint(pos) : pos };
				}),
			);
		},
		[nodes, selectedNodeIds, setNodes, snapToGrid],
	);

	const handleDistribute = useCallback(
		(axis: "x" | "y") => {
			const selected = nodes.filter((n) => selectedNodeIds.has(n.id));
			if (selected.length < 3) return;
			const sorted = [...selected].sort((a, b) =>
				axis === "x"
					? a.position.x - b.position.x
					: a.position.y - b.position.y,
			);
			const first = sorted[0].position[axis];
			const last = sorted[sorted.length - 1].position[axis];
			const gap = (last - first) / (sorted.length - 1);
			const positionMap = new Map<string, number>();
			sorted.forEach((n, i) => positionMap.set(n.id, first + gap * i));
			setNodes((prev) =>
				prev.map((n) => {
					if (!positionMap.has(n.id)) return n;
					const pos = { ...n.position };
					const newValue = positionMap.get(n.id);
					if (newValue !== undefined) pos[axis] = newValue;
					return { ...n, position: snapToGrid ? snapPoint(pos) : pos };
				}),
			);
		},
		[nodes, selectedNodeIds, setNodes, snapToGrid],
	);

	return {
		handleAddTextNode,
		handleAddLinkNode,
		handleAddCurrentNote,
		handleRefreshLink,
		handleFrameSelection,
		handleReflowGrid,
		handleAlign,
		handleDistribute,
	};
}
