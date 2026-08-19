export const CONNECTIONS_GRAPH_SLIDER_MIN = 0;
export const CONNECTIONS_GRAPH_SLIDER_MAX = 100;
export const CONNECTIONS_GRAPH_MIN_CONNECTIONS_MAX = 12;

export interface ConnectionsGraphOptions {
	readonly nodeSize: number;
	readonly linkOpacity: number;
	readonly linkThickness: number;
	readonly labelZoomThreshold: number;
	readonly hideOrphanNodes: boolean;
	readonly minConnections: number;
}

export const DEFAULT_CONNECTIONS_GRAPH_OPTIONS: ConnectionsGraphOptions = {
	nodeSize: 50,
	linkOpacity: 72,
	linkThickness: 40,
	labelZoomThreshold: 20,
	hideOrphanNodes: false,
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

export function connectionsNodeSizeScale(value: number) {
	return unitScale(value, 0.45, 2);
}

export function connectionsLinkOpacity(value: number) {
	return unitScale(value, 0.55, 1);
}

export function connectionsLinkThicknessScale(value: number) {
	return unitScale(value, 0.5, 1.8);
}

export function connectionsLabelVisibility(value: number) {
	if (value <= 0) {
		return {
			labelDensity: 0,
			labelGridCellSize: 320,
			labelRenderedSizeThreshold: Number.POSITIVE_INFINITY,
		};
	}
	const t = Math.min(100, value) / 100;
	const eased = t * t * t;
	return {
		labelDensity: 0.03 + eased * 16,
		labelGridCellSize: Math.round(320 - t * 288),
		labelRenderedSizeThreshold: 0,
	};
}

export function connectionsMinimumVisibleDegree(
	options: ConnectionsGraphOptions,
) {
	const orphanFloor = options.hideOrphanNodes ? 1 : 0;
	return Math.max(orphanFloor, options.minConnections);
}
