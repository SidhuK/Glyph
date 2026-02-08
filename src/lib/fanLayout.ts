import type { CanvasNode } from "./canvasFlowTypes";
import { GRID_SIZE, estimateNodeSize } from "./canvasLayout";
import type { FsEntry } from "./tauri";

export const FAN_GRID_CELL_WIDTH = GRID_SIZE * 9 + 8;
export const FAN_GRID_CELL_HEIGHT = GRID_SIZE * 8 + 12;
export const FAN_GRID_EXCLUSION_MARGIN = GRID_SIZE / 2;
export const FAN_SLOT_MARGIN = 8;
export const FAN_REFLOW_Y_PADDING = GRID_SIZE * 4;
export const FAN_REFLOW_SCAN_STEP = GRID_SIZE * 2;
export const FAN_COLLISION_MARGIN = 60;
export const FAN_MOVE_TRANSITION =
	"transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
export const FAN_MOVE_TRANSITION_MS = 320;
export const FAN_MAX_ENTRIES = 100;

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

export function computeFanGridLayout(
	folderNode: CanvasNode,
	files: FsEntry[],
): Array<{ x: number; y: number }> {
	if (!files.length) return [];
	const folderSize = estimateNodeSize({
		id: folderNode.id,
		type: folderNode.type ?? "folder",
		data: folderNode.data ?? {},
	});
	const folderRect: RectBox = {
		left: folderNode.position.x,
		top: folderNode.position.y,
		right: folderNode.position.x + folderSize.w,
		bottom: folderNode.position.y + folderSize.h,
	};
	const centerX = folderRect.left + folderSize.w / 2;
	const centerY = folderRect.top + folderSize.h / 2;

	const candidates: Array<{ cx: number; cy: number; ring: number }> = [];
	const needed = files.length;
	const maxRing = Math.max(4, Math.ceil(Math.sqrt(needed)) + 6);

	for (let ring = 0; ring <= maxRing && candidates.length < needed; ring += 1) {
		for (let gx = -ring; gx <= ring; gx += 1) {
			for (let gy = -ring; gy <= ring; gy += 1) {
				if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
				const cx = centerX + gx * FAN_GRID_CELL_WIDTH;
				const cy = centerY + gy * FAN_GRID_CELL_HEIGHT;
				candidates.push({ cx, cy, ring });
			}
		}
	}

	candidates.sort((a, b) => {
		if (a.ring !== b.ring) return a.ring - b.ring;
		const ay = Math.abs(a.cy - centerY);
		const by = Math.abs(b.cy - centerY);
		if (ay !== by) return ay - by;
		return Math.abs(a.cx - centerX) - Math.abs(b.cx - centerX);
	});

	const usedIndices = new Set<number>();
	const placedRects: RectBox[] = [];

	return files.map((file, index) => {
		const width = file.is_markdown ? 230 : 220;
		const height = file.is_markdown ? 160 : 200;
		let chosen = {
			x: centerX + (index + 1) * FAN_GRID_CELL_WIDTH,
			y: centerY,
		};

		for (const [candidateIndex, candidate] of candidates.entries()) {
			if (usedIndices.has(candidateIndex)) continue;
			const nextRect: RectBox = {
				left: candidate.cx - width / 2,
				top: candidate.cy - height / 2,
				right: candidate.cx + width / 2,
				bottom: candidate.cy + height / 2,
			};
			if (intersectsRect(nextRect, folderRect, FAN_GRID_EXCLUSION_MARGIN))
				continue;
			if (
				placedRects.some((placed) =>
					intersectsRect(nextRect, placed, FAN_SLOT_MARGIN),
				)
			)
				continue;
			usedIndices.add(candidateIndex);
			placedRects.push(nextRect);
			chosen = { x: candidate.cx, y: candidate.cy };
			break;
		}

		return { x: chosen.x - width / 2, y: chosen.y - height / 2 };
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
