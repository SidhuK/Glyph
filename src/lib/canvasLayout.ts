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
	const safetyPx = Math.max(12, Math.round(gridSize * 0.5));
	const sizeUnits = sizes.map((s) => {
		const w = Math.max(1, Math.ceil((s.w + safetyPx) / gridSize));
		const h = Math.max(1, Math.ceil((s.h + safetyPx) / gridSize));
		return { w, h, area: w * h };
	});

	const indices = nodes.map((_, i) => i);
	indices.sort((a, b) => {
		const areaDiff = sizeUnits[b].area - sizeUnits[a].area;
		if (areaDiff !== 0) return areaDiff;
		return nodes[a].id.localeCompare(nodes[b].id);
	});

	const totalArea = sizeUnits.reduce((sum, s) => sum + s.area, 0);
	const maxWidthUnits = Math.max(...sizeUnits.map((s) => s.w));
	const preferredColumns =
		options?.columns ?? Math.max(2, Math.min(8, Math.ceil(Math.sqrt(count))));
	const avgWidthUnits =
		sizeUnits.reduce((sum, s) => sum + s.w, 0) / sizeUnits.length;
	const widthFromColumns = Math.ceil(avgWidthUnits * preferredColumns);
	const baseWidth = Math.max(
		maxWidthUnits,
		widthFromColumns,
		Math.ceil(Math.sqrt(totalArea)),
	);

	const targetWidthUnits = Math.max(maxWidthUnits, widthFromColumns);
	const tryWidths = Math.max(6, preferredColumns * 3);
	const minWidth = Math.max(
		maxWidthUnits,
		Math.floor(targetWidthUnits - tryWidths / 2),
	);
	const maxWidth = Math.max(minWidth, Math.ceil(targetWidthUnits + tryWidths));
	let bestPositions: Array<{ x: number; y: number }> | null = null;
	let bestScore = Number.POSITIVE_INFINITY;

	for (let widthUnits = minWidth; widthUnits <= maxWidth; widthUnits++) {
		const skyline = new Array(widthUnits).fill(0);
		const placed: Array<{ x: number; y: number }> = new Array(count);
		for (const idx of indices) {
			const rect = sizeUnits[idx];
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
				if (
					heightAfter < bestHeight ||
					(heightAfter === bestHeight && y < bestY)
				) {
					bestHeight = heightAfter;
					bestY = y;
					bestX = x;
				}
			}
			for (let j = 0; j < paddedW; j++) {
				skyline[bestX + j] = bestY + paddedH;
			}
			placed[idx] = { x: bestX, y: bestY };
		}

		const maxHeight = Math.max(...skyline);
		const widthPenalty = Math.abs(widthUnits - targetWidthUnits);
		const score = maxHeight * widthUnits + widthPenalty * maxHeight * 2;
		if (score < bestScore) {
			bestScore = score;
			bestPositions = placed;
		}
	}

	if (bestPositions) {
		for (let i = 0; i < count; i++) {
			const pos = bestPositions[i] ?? { x: 0, y: 0 };
			const x = startX + pos.x * gridSize;
			const y = startY + pos.y * gridSize;
			result.set(nodes[i].id, snapPoint({ x, y }, gridSize));
		}
	}

	return result;
}
