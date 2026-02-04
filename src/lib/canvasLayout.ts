export const GRID_SIZE = 24;
export const GRID_GAP = GRID_SIZE * 2;

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

function getNodeHash(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function getRandomVariation(id: string, min: number, max: number): number {
	const hash = getNodeHash(id);
	const range = max - min;
	return min + (hash % range);
}

function estimateNoteDimensions(
	id: string,
	content: string,
): { w: number; h: number } {
	const hasContent = content.length > 0;
	const lines = content.split("\n").filter((line) => line.trim().length > 0);
	const lineCount = lines.length;
	const avgLineLength = lines.length > 0 ? content.length / lines.length : 0;

	const sizeClass = !hasContent
		? "xs"
		: lineCount === 1 && content.length < 30
			? "xs"
			: lineCount === 1 && content.length < 80
				? "sm"
				: lineCount <= 2 && content.length < 150
					? "md"
					: lineCount <= 4 && avgLineLength < 40
						? "tall"
						: lineCount <= 3 && avgLineLength > 60
							? "wide"
							: lineCount <= 6 && content.length < 400
								? "lg"
								: "xl";

	let base: { w: number; h: number };
	switch (sizeClass) {
		case "xs":
			base = { w: 100, h: 80 };
			break;
		case "sm":
			base = { w: 140, h: 100 };
			break;
		case "md":
			base = { w: 200, h: 140 };
			break;
		case "lg":
			base = { w: 280, h: 200 };
			break;
		case "xl":
			base = { w: 360, h: 260 };
			break;
		case "tall":
			base = { w: 160, h: 240 };
			break;
		case "wide":
			base = { w: 320, h: 160 };
			break;
		default:
			base = { w: 200, h: 140 };
	}

	const randomWidth = getRandomVariation(id, -15, 15);
	const randomHeight = getRandomVariation(id, -10, 20);
	return { w: base.w + randomWidth, h: base.h + randomHeight };
}

export function estimateNodeSize(node: LayoutNode): { w: number; h: number } {
	const type = node.type ?? "";
	if (type === "note") {
		const content =
			typeof node.data?.content === "string" ? node.data?.content : "";
		return estimateNoteDimensions(node.id, content);
	}
	if (type === "file") return { w: 220, h: 200 };
	if (type === "folder") return { w: 240, h: 180 };
	if (type === "link") return { w: 260, h: 200 };
	if (type === "text") return { w: 220, h: 140 };
	if (type === "frame") return { w: 300, h: 220 };
	return { w: 220, h: 160 };
}

export function computeGridPositions(
	nodes: LayoutNode[],
	options?: {
		startX?: number;
		startY?: number;
		columns?: number;
		gridSize?: number;
		gap?: number;
	},
): Map<string, { x: number; y: number }> {
	const count = nodes.length;
	const result = new Map<string, { x: number; y: number }>();
	if (count === 0) return result;

	const gridSize = options?.gridSize ?? GRID_SIZE;
	const gap = options?.gap ?? GRID_GAP;
	const columns =
		options?.columns ??
		Math.max(2, Math.min(6, Math.ceil(Math.sqrt(count))));
	const startX = options?.startX ?? 0;
	const startY = options?.startY ?? 0;

	const sizes = nodes.map((n) => estimateNodeSize(n));

	const columnWidths: number[] = new Array(columns).fill(0);
	const rowHeights: number[] = [];
	for (let i = 0; i < count; i++) {
		const row = Math.floor(i / columns);
		const col = i % columns;
		const size = sizes[i] ?? { w: 0, h: 0 };
		columnWidths[col] = Math.max(columnWidths[col] ?? 0, size.w);
		rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.h);
	}

	const colOffsets: number[] = [];
	const rowOffsets: number[] = [];
	let accX = 0;
	for (let c = 0; c < columnWidths.length; c++) {
		colOffsets[c] = accX;
		accX += columnWidths[c] + gap;
	}
	let accY = 0;
	for (let r = 0; r < rowHeights.length; r++) {
		rowOffsets[r] = accY;
		accY += rowHeights[r] + gap;
	}

	for (let i = 0; i < count; i++) {
		const row = Math.floor(i / columns);
		const col = i % columns;
		const x = startX + (colOffsets[col] ?? 0);
		const y = startY + (rowOffsets[row] ?? 0);
		result.set(nodes[i].id, snapPoint({ x, y }, gridSize));
	}

	return result;
}
