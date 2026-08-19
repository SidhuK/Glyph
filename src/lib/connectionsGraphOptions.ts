export const CONNECTIONS_GRAPH_SLIDER_MIN = 0;
export const CONNECTIONS_GRAPH_SLIDER_MAX = 100;
export const CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX = 12;

export interface ConnectionsGraphOptions {
	readonly repelForce: number;
	readonly linkDistance: number;
	readonly linkStrength: number;
	readonly centerForce: number;
	readonly nodeSize: number;
	readonly linkOpacity: number;
	readonly linkThickness: number;
	readonly labelZoomThreshold: number;
	readonly hideOrphanNodes: boolean;
	readonly minConnections: number;
}

export const DEFAULT_CONNECTIONS_GRAPH_OPTIONS: ConnectionsGraphOptions = {
	repelForce: 50,
	linkDistance: 50,
	linkStrength: 50,
	centerForce: 50,
	nodeSize: 50,
	linkOpacity: 70,
	linkThickness: 50,
	labelZoomThreshold: 50,
	hideOrphanNodes: true,
	minConnections: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeConnectionsGraphOptions(
	value: unknown,
): ConnectionsGraphOptions {
	const source = isRecord(value) ? value : {};
	return {
		repelForce: clampNumber(
			source.repelForce,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.repelForce,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		linkDistance: clampNumber(
			source.linkDistance,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.linkDistance,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		linkStrength: clampNumber(
			source.linkStrength,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.linkStrength,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		centerForce: clampNumber(
			source.centerForce,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.centerForce,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		nodeSize: clampNumber(
			source.nodeSize,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.nodeSize,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		linkOpacity: clampNumber(
			source.linkOpacity,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.linkOpacity,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		linkThickness: clampNumber(
			source.linkThickness,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.linkThickness,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		labelZoomThreshold: clampNumber(
			source.labelZoomThreshold,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.labelZoomThreshold,
			CONNECTIONS_GRAPH_SLIDER_MIN,
			CONNECTIONS_GRAPH_SLIDER_MAX,
		),
		hideOrphanNodes:
			typeof source.hideOrphanNodes === "boolean"
				? source.hideOrphanNodes
				: DEFAULT_CONNECTIONS_GRAPH_OPTIONS.hideOrphanNodes,
		minConnections: clampNumber(
			source.minConnections,
			DEFAULT_CONNECTIONS_GRAPH_OPTIONS.minConnections,
			0,
			CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX,
		),
	};
}

function unitScale(value: number, min: number, max: number) {
	const t = Math.min(100, Math.max(0, value)) / 100;
	return min + t * (max - min);
}

export function connectionsForceScale(value: number) {
	return unitScale(value, 0.4, 1.6);
}

export function connectionsNodeSizeScale(value: number) {
	return unitScale(value, 0.45, 2);
}

export function connectionsLinkOpacity(value: number) {
	return unitScale(value, 0.12, 1);
}

export function connectionsLinkThicknessScale(value: number) {
	return unitScale(value, 0.4, 2);
}

export function connectionsLabelRenderedSizeThreshold(
	value: number,
	base: number,
) {
	return base * unitScale(value, 0.35, 2.4);
}

export function connectionsMinimumVisibleDegree(
	options: ConnectionsGraphOptions,
) {
	const orphanFloor = options.hideOrphanNodes ? 1 : 0;
	return Math.max(orphanFloor, options.minConnections);
}
