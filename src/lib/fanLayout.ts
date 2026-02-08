import type { CanvasNode } from "./canvasFlowTypes";
import { GRID_SIZE, estimateNodeSize } from "./canvasLayout";

export const FAN_REFLOW_Y_PADDING = GRID_SIZE * 4;
export const FAN_REFLOW_X_PADDING = GRID_SIZE * 4;
export const FAN_REFLOW_SCAN_STEP = GRID_SIZE * 2;
export const FAN_COLLISION_MARGIN = 60;
export const FAN_MOVE_TRANSITION =
	"transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
export const FAN_MOVE_TRANSITION_MS = 320;
export const FAN_MAX_ENTRIES = 5;

export type RectBox = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export type FolderFanState = {
	fanNodeIds: Set<string>;
	displacedByNodeId: Map<string, { x: number; y: number }>;
};

export type FanLayoutItem = {
	x: number;
	y: number;
	rotation: number;
	zIndex: number;
};

function seededRandom(seed: string): () => number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
	}
	return () => {
		h = (Math.imul(h, 1103515245) + 12345) | 0;
		return ((h >>> 16) & 0x7fff) / 0x7fff;
	};
}

export function sanitizeFolderDataForSave(
	data: Record<string, unknown>,
): Record<string, unknown> {
	if (!("fan_expanded" in data)) return data;
	const { fan_expanded: _fanExpanded, ...rest } = data;
	return rest;
}

export function folderFanNodeId(folderNodeId: string, relPath: string): string {
	return `folderfan:${folderNodeId}:${relPath}`;
}

export function intersectsRect(a: RectBox, b: RectBox, margin = 0): boolean {
	return (
		a.left < b.right + margin &&
		a.right > b.left - margin &&
		a.top < b.bottom + margin &&
		a.bottom > b.top - margin
	);
}

export function nodeRectAtPosition(
	node: CanvasNode,
	position: { x: number; y: number },
): RectBox {
	const size = estimateNodeSize({
		id: node.id,
		type: node.type ?? "",
		data: node.data ?? {},
	});
	return {
		left: position.x,
		top: position.y,
		right: position.x + size.w,
		bottom: position.y + size.h,
	};
}

const SCATTER_SLOTS: Array<{
	dx: number;
	dy: number;
	rot: number;
}> = [
	{ dx: 1.02, dy: 0.04, rot: 1.8 },
	{ dx: 1.85, dy: -0.16, rot: -1.2 },
	{ dx: 2.68, dy: 0.12, rot: 1.1 },
	{ dx: 3.48, dy: -0.08, rot: -0.9 },
	{ dx: 4.26, dy: 0.18, rot: 0.8 },
];

const JITTER_X = 12;
const JITTER_Y = 6;
const JITTER_ROT = 1.1;

export function computeFanGridLayout(
	folderNode: CanvasNode,
	fileCount: number,
): FanLayoutItem[] {
	if (!fileCount) return [];

	const folderSize = estimateNodeSize({
		id: folderNode.id,
		type: folderNode.type ?? "folder",
		data: folderNode.data ?? {},
	});

	const folderX = folderNode.position.x;
	const folderY = folderNode.position.y;
	const fw = folderSize.w;
	const fh = folderSize.h;
	const n = Math.min(fileCount, SCATTER_SLOTS.length);

	const rng = seededRandom(folderNode.id);

	return Array.from({ length: n }, (_, i) => {
		const slot = SCATTER_SLOTS[i];
		const jx = (rng() - 0.5) * 2 * JITTER_X;
		const jy = (rng() - 0.5) * 2 * JITTER_Y;
		const jr = (rng() - 0.5) * 2 * JITTER_ROT;

		const x = folderX + slot.dx * fw + jx;
		const y = folderY + slot.dy * fh + jy;
		const rotation = Number.parseFloat((slot.rot + jr).toFixed(2));

		return { x, y, rotation, zIndex: 1000 + i };
	});
}

export function createSpatialHash(cellSize: number) {
	const cells = new Map<string, RectBox[]>();

	function key(cx: number, cy: number): string {
		return `${cx},${cy}`;
	}

	function cellRange(r: RectBox) {
		const minCx = Math.floor(r.left / cellSize);
		const maxCx = Math.floor(r.right / cellSize);
		const minCy = Math.floor(r.top / cellSize);
		const maxCy = Math.floor(r.bottom / cellSize);
		return { minCx, maxCx, minCy, maxCy };
	}

	return {
		insert(r: RectBox): void {
			const { minCx, maxCx, minCy, maxCy } = cellRange(r);
			for (let cx = minCx; cx <= maxCx; cx++) {
				for (let cy = minCy; cy <= maxCy; cy++) {
					const k = key(cx, cy);
					const bucket = cells.get(k);
					if (bucket) {
						bucket.push(r);
					} else {
						cells.set(k, [r]);
					}
				}
			}
		},
		query(r: RectBox): RectBox[] {
			const seen = new Set<RectBox>();
			const result: RectBox[] = [];
			const { minCx, maxCx, minCy, maxCy } = cellRange(r);
			for (let cx = minCx; cx <= maxCx; cx++) {
				for (let cy = minCy; cy <= maxCy; cy++) {
					const bucket = cells.get(key(cx, cy));
					if (!bucket) continue;
					for (const item of bucket) {
						if (!seen.has(item)) {
							seen.add(item);
							result.push(item);
						}
					}
				}
			}
			return result;
		},
	};
}
