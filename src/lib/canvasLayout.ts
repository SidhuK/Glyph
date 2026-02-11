import {
	CANVAS_CARD_HEIGHT,
	CANVAS_CARD_WIDTH,
	FOLDER_NODE_HEIGHT,
	FOLDER_NODE_WIDTH,
} from "./canvasConstants";

export const GRID_SIZE = 24;
export const GRID_GAP = GRID_SIZE * 4;
export const MAX_CANVAS_AUTO_ROWS = 3;

export type LayoutNode = {
	id: string;
	type?: string;
	data?: Record<string, unknown> | null;
};

export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
	return Math.round(value / grid) * grid;
}

export function snapPoint(
	point: { x: number; y: number },
	grid: number = GRID_SIZE,
): { x: number; y: number } {
	return { x: snapToGrid(point.x, grid), y: snapToGrid(point.y, grid) };
}

export function estimateNodeSize(node: LayoutNode): { w: number; h: number } {
	const type = node.type ?? "";
	if (type === "note") return { w: CANVAS_CARD_WIDTH, h: CANVAS_CARD_HEIGHT };
	if (type === "file") return { w: CANVAS_CARD_WIDTH, h: CANVAS_CARD_HEIGHT };
	if (type === "folder") return { w: FOLDER_NODE_WIDTH, h: FOLDER_NODE_HEIGHT };
	if (type === "link") return { w: 260, h: 200 };
	if (type === "text") return { w: 190, h: 110 };
	if (type === "frame") return { w: 300, h: 220 };
	return { w: 220, h: 160 };
}

export function columnsForMaxRows(
	nodeCount: number,
	maxRows = MAX_CANVAS_AUTO_ROWS,
): number {
	if (nodeCount <= 0) return 1;
	const safeRows = Math.max(1, maxRows);
	return Math.max(1, Math.ceil(nodeCount / safeRows));
}

export function computeGridPositions(
	nodes: LayoutNode[],
	options?: {
		startX?: number;
		startY?: number;
		columns?: number;
		maxRows?: number;
		gridSize?: number;
		gap?: number;
		paddingX?: number;
		paddingY?: number;
		safetyPxX?: number;
		safetyPxY?: number;
	},
): Map<string, { x: number; y: number }> {
	const count = nodes.length;
	const result = new Map<string, { x: number; y: number }>();
	if (count === 0) return result;

	const gridSize = options?.gridSize ?? GRID_SIZE;
	const maxRows = Math.max(1, options?.maxRows ?? MAX_CANVAS_AUTO_ROWS);
	const startX = options?.startX ?? 0;
	const startY = options?.startY ?? 0;
	const gap = options?.gap ?? GRID_GAP;
	const paddingX = options?.paddingX ?? gap;
	const paddingY = options?.paddingY ?? gap;
	const safetyPxX =
		options?.safetyPxX ?? Math.max(12, Math.round(gridSize * 0.5));
	const safetyPxY =
		options?.safetyPxY ?? Math.max(12, Math.round(gridSize * 0.5));

	const sizes = nodes.map((n) => estimateNodeSize(n));
	const paddingUnitsX = Math.max(1, Math.round(paddingX / gridSize));
	const paddingUnitsY = Math.max(1, Math.round(paddingY / gridSize));
	const sizeUnits = sizes.map((s) => {
		const w = Math.max(1, Math.ceil((s.w + safetyPxX) / gridSize));
		const h = Math.max(1, Math.ceil((s.h + safetyPxY) / gridSize));
		return { w, h };
	});
	const columns = Math.max(
		1,
		options?.columns ?? columnsForMaxRows(count, maxRows),
	);
	const rows = Math.max(1, Math.min(maxRows, Math.ceil(count / columns)));
	const cellWUnits =
		Math.max(...sizeUnits.map((s) => s.w)) + Math.max(0, paddingUnitsX);
	const cellHUnits =
		Math.max(...sizeUnits.map((s) => s.h)) + Math.max(0, paddingUnitsY);

	for (let i = 0; i < count; i++) {
		const row = i % rows;
		const col = Math.floor(i / rows);
		const x = startX + col * cellWUnits * gridSize;
		const y = startY + row * cellHUnits * gridSize;
		result.set(nodes[i].id, snapPoint({ x, y }, gridSize));
	}

	return result;
}
