import { STICKY_COLORS } from "./constants";
import type { CanvasEdge, CanvasNode } from "./types";

export function snapshotPersistedShape(
	n: CanvasNode[],
	e: CanvasEdge[],
): string {
	return JSON.stringify({
		n: n.map((node) => ({
			id: node.id,
			type: node.type ?? null,
			position: node.position,
			data: node.data ?? null,
			parentNode: node.parentNode,
			extent: node.extent ?? null,
			style: node.style ?? null,
		})),
		e: e.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			type: edge.type ?? null,
			label: edge.label ?? null,
			data: edge.data ?? null,
			style: edge.style ?? null,
		})),
	});
}

export function getNodeHash(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

export function getRandomVariation(
	id: string,
	min: number,
	max: number,
): number {
	const hash = getNodeHash(id);
	const range = max - min;
	return min + (hash % range);
}

export function getNodeRotation(_id: string): number {
	return 0;
}

export function getStickyColor(id: string) {
	return STICKY_COLORS[getNodeHash(id) % STICKY_COLORS.length];
}

export function formatNoteMtime(mtimeMs: number | null): string {
	if (!mtimeMs) return "";
	const date = new Date(mtimeMs);
	const now = new Date();
	const sameYear = date.getFullYear() === now.getFullYear();
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: sameYear ? undefined : "numeric",
	}).format(date);
}

export function computeNoteSizeClass(content: string): string {
	const hasContent = content.length > 0;
	const lines = content.split("\n").filter((line) => line.trim().length > 0);
	const lineCount = lines.length;
	const avgLineLength = lines.length > 0 ? content.length / lines.length : 0;

	if (!hasContent) return "rfNodeNote--small";
	if (lineCount === 1 && content.length < 30) return "rfNodeNote--xs";
	if (lineCount === 1 && content.length < 80) return "rfNodeNote--small";
	if (lineCount <= 2 && content.length < 150) return "rfNodeNote--medium";
	if (lineCount <= 4 && avgLineLength < 40) return "rfNodeNote--tall";
	if (lineCount <= 3 && avgLineLength > 60) return "rfNodeNote--wide";
	if (lineCount <= 6 && content.length < 400) return "rfNodeNote--large";
	return "rfNodeNote--xl";
}
