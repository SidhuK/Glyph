import { createEdgeCurveProgram } from "@sigma/edge-curve";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsGraphAttributes,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
} from "./connectionsGraph";

const ConnectionsCurveProgram = createEdgeCurveProgram<
	ConnectionsNodeAttributes,
	ConnectionsEdgeAttributes,
	ConnectionsGraphAttributes
>();

interface CountTier {
	readonly min: number;
	readonly scale: number;
}

const SPACE_NODE_SCALE_TIERS: readonly CountTier[] = [
	{ min: 10_000, scale: 0.6 },
	{ min: 5_000, scale: 0.7 },
	{ min: 2_000, scale: 0.8 },
	{ min: 1_000, scale: 0.9 },
];

const SPACE_EDGE_SCALE_TIERS: readonly CountTier[] = [
	{ min: 10_000, scale: 0.62 },
	{ min: 5_000, scale: 0.72 },
	{ min: 2_000, scale: 0.82 },
	{ min: 1_000, scale: 0.9 },
	{ min: 400, scale: 0.96 },
];

/** Past this many nodes, labels and edges drop out while the camera moves to keep panning smooth. */
const LARGE_GRAPH_NODES = 2_000;
const LARGE_GRAPH_EDGES = 5_000;

function tierScale(tiers: readonly CountTier[], count: number) {
	return tiers.find((tier) => count >= tier.min)?.scale ?? 1;
}

export function spaceNodeSizeScale(nodeCount: number) {
	return tierScale(SPACE_NODE_SCALE_TIERS, nodeCount);
}

export function connectionsEdgeScale(edgeCount: number) {
	return tierScale(SPACE_EDGE_SCALE_TIERS, edgeCount);
}

/** Maps the 0–100 label slider onto sigma's label grid; higher values show more titles at rest. */
export function connectionsLabelGrid(labelZoomThreshold: number) {
	const t = Math.min(100, Math.max(0, labelZoomThreshold)) / 100;
	return {
		labelDensity: 0.6 + t * 3,
		labelGridCellSize: Math.round(180 - t * 100),
		labelRenderedSizeThreshold: 0,
	};
}

/**
 * Camera ratio below which leaf ("dot") labels join the label grid. Zero never reveals them;
 * local graphs are small enough to label everything at rest.
 */
export function connectionsDotLabelRatio(
	variant: ConnectionsGraphVariant,
	labelZoomThreshold: number,
) {
	if (variant === "local") return Number.POSITIVE_INFINITY;
	if (labelZoomThreshold <= 0) return 0;
	return 0.35 + (Math.min(100, labelZoomThreshold) / 100) * 0.6;
}

const SHARED_SIGMA = {
	renderLabels: true,
	renderEdgeLabels: false,
	enableEdgeEvents: false,
	defaultNodeType: "circle",
	defaultEdgeType: "curved",
	edgeProgramClasses: { curved: ConnectionsCurveProgram },
	zIndex: true,
	allowInvalidContainer: false,
};

export function sigmaSettingsForVariant(
	variant: ConnectionsGraphVariant,
	edgeCount: number,
	nodeCount: number,
	labelZoomThreshold: number,
) {
	if (variant === "local") {
		return {
			...SHARED_SIGMA,
			hideLabelsOnMove: false,
			hideEdgesOnMove: false,
			labelDensity: 1.1,
			labelGridCellSize: 88,
			labelRenderedSizeThreshold: 0,
			minCameraRatio: 0.35,
			maxCameraRatio: 2.2,
			stagePadding: 72,
			zoomingRatio: 1.7,
		};
	}

	return {
		...SHARED_SIGMA,
		...connectionsLabelGrid(labelZoomThreshold),
		hideLabelsOnMove: nodeCount > LARGE_GRAPH_NODES,
		hideEdgesOnMove: edgeCount > LARGE_GRAPH_EDGES,
		minCameraRatio: nodeCount >= 5_000 ? 0.05 : 0.12,
		maxCameraRatio: 2,
		// Room for cluster captions above the top-most cluster and labels to the right of nodes.
		stagePadding: 72,
		zoomingRatio: 1.5,
	};
}
