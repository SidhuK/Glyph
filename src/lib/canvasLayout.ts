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
	const startX = options?.startX ?? 0;
	const startY = options?.startY ?? 0;

	const sizes = nodes.map((n) => estimateNodeSize(n));
	const paddingUnits = Math.max(1, Math.round(gap / gridSize));
	const sizeUnits = sizes.map((s) => ({
		w: Math.max(1, Math.ceil(s.w / gridSize)),
		h: Math.max(1, Math.ceil(s.h / gridSize)),
	}));
	const totalArea = sizeUnits.reduce((sum, s) => sum + s.w * s.h, 0);
	const maxWidthUnits = Math.max(...sizeUnits.map((s) => s.w));
	const preferredColumns =
		options?.columns ??
		Math.max(2, Math.min(8, Math.ceil(Math.sqrt(count))));
	const avgWidthUnits =
		sizeUnits.reduce((sum, s) => sum + s.w, 0) / sizeUnits.length;
	const widthFromColumns = Math.ceil(avgWidthUnits * preferredColumns);
	const widthUnits = Math.max(
		maxWidthUnits,
		widthFromColumns,
		Math.ceil(Math.sqrt(totalArea)),
	);

	const skyline = new Array(widthUnits).fill(0);
	for (let i = 0; i < count; i++) {
		const rect = sizeUnits[i];
		const paddedW = rect.w + paddingUnits;
		const paddedH = rect.h + paddingUnits;
		let bestX = 0;
		let bestY = Number.POSITIVE_INFINITY;
		let bestHeight = Number.POSITIVE_INFINITY;
		const maxX = Math.max(0, widthUnits - paddedW);
		for (let x = 0; x <= maxX; x++) {
			let y = 0;
			for (let j = 0; j < paddedW; j++) {
				const h = skyline[x + j] ?? 0;
				if (h > y) y = h;
			}
			const heightAfter = y + paddedH;
			if (heightAfter < bestHeight || (heightAfter === bestHeight && y < bestY)) {
				bestHeight = heightAfter;
				bestY = y;
				bestX = x;
			}
		}
		for (let j = 0; j < paddedW; j++) {
			skyline[bestX + j] = bestY + paddedH;
		}
		const x = startX + bestX * gridSize;
		const y = startY + bestY * gridSize;
		result.set(nodes[i].id, snapPoint({ x, y }, gridSize));
	}

	return result;
}
