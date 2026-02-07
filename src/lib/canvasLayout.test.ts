import { describe, expect, it } from "vitest";
import {
	GRID_SIZE,
	computeGridPositions,
	estimateNodeSize,
	snapToGrid,
} from "./canvasLayout";

describe("canvasLayout", () => {
	it("snaps numbers to grid", () => {
		expect(snapToGrid(0)).toBe(0);
		expect(snapToGrid(23)).toBe(24);
		expect(snapToGrid(37)).toBe(48);
		expect(snapToGrid(-13)).toBe(-24);
	});

	it("estimates node sizes by type", () => {
		expect(estimateNodeSize({ id: "a", type: "file" })).toEqual({
			w: 220,
			h: 200,
		});
		expect(estimateNodeSize({ id: "b", type: "folder" })).toEqual({
			w: 260,
			h: 190,
		});
		expect(
			estimateNodeSize({
				id: "c",
				type: "note",
				data: { title: "T", content: "one\ntwo\nthree" },
			}),
		).toEqual(expect.objectContaining({ w: 230 }));
	});

	it("computes deterministic, snapped positions for all nodes", () => {
		const nodes = Array.from({ length: 12 }, (_, i) => ({
			id: `n${i + 1}`,
			type: i % 2 === 0 ? "note" : "text",
			data: { title: `title-${i}`, content: "x".repeat(30 + i) },
		}));
		const positions = computeGridPositions(nodes, {
			startX: 10,
			startY: 20,
			gridSize: GRID_SIZE,
		});
		expect(positions.size).toBe(nodes.length);

		const seen = new Set<string>();
		for (const node of nodes) {
			const pos = positions.get(node.id);
			expect(pos).toBeDefined();
			if (!pos) continue;
			expect(pos.x % GRID_SIZE).toBe(0);
			expect(pos.y % GRID_SIZE).toBe(0);
			seen.add(`${pos.x}:${pos.y}`);
		}
		expect(seen.size).toBe(nodes.length);
	});
});
