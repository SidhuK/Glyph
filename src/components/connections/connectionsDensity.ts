import type { ConnectionsGraphVariant } from "./connectionsGraph";

export const LOCAL_CENTER_NODE_SIZE = 14;
export const LOCAL_FOCUS_NODE_SIZE = 18;

type SpaceNodeSizeRange = readonly [min: number, max: number];

interface SpaceDensityTier {
	minNodes: number;
	noteSize: SpaceNodeSizeRange;
	tagSize: SpaceNodeSizeRange;
}

const SPACE_NODE_DENSITY_TIERS: readonly SpaceDensityTier[] = [
	{
		minNodes: 10_000,
		noteSize: [0.5, 2.4],
		tagSize: [0.7, 2.8],
	},
	{
		minNodes: 5_000,
		noteSize: [0.7, 3.2],
		tagSize: [0.9, 3.6],
	},
	{
		minNodes: 2_000,
		noteSize: [1, 4.8],
		tagSize: [1.2, 5.2],
	},
	{
		minNodes: 1_000,
		noteSize: [1.6, 7],
		tagSize: [1.8, 6.2],
	},
	{
		minNodes: 400,
		noteSize: [2.4, 11],
		tagSize: [2.6, 8],
	},
	{
		minNodes: 0,
		noteSize: [3.2, 14],
		tagSize: [3.4, 9],
	},
];

interface SpaceEdgeScaleTier {
	minEdges: number;
	scale: number;
}

const SPACE_EDGE_SCALE_TIERS: readonly SpaceEdgeScaleTier[] = [
	{ minEdges: 10_000, scale: 0.62 },
	{ minEdges: 5_000, scale: 0.72 },
	{ minEdges: 2_000, scale: 0.82 },
	{ minEdges: 1_000, scale: 0.9 },
	{ minEdges: 400, scale: 0.96 },
];

interface SpaceSigmaTier {
	minNodes: number;
	labelDensity: number;
	labelGridCellSize: number;
	labelRenderedSizeThreshold: number;
	stagePadding: number;
	minEdgeThickness: number;
	minCameraRatio: number;
}

const SPACE_SIGMA_TIERS: readonly SpaceSigmaTier[] = [
	{
		minNodes: 5_000,
		labelDensity: 0.08,
		labelGridCellSize: 280,
		labelRenderedSizeThreshold: 18,
		stagePadding: 36,
		minEdgeThickness: 0.7,
		minCameraRatio: 0.05,
	},
	{
		minNodes: 1_000,
		labelDensity: 0.22,
		labelGridCellSize: 200,
		labelRenderedSizeThreshold: 14,
		stagePadding: 40,
		minEdgeThickness: 0.78,
		minCameraRatio: 0.18,
	},
	{
		minNodes: 150,
		labelDensity: 0.16,
		labelGridCellSize: 165,
		labelRenderedSizeThreshold: 11,
		stagePadding: 48,
		minEdgeThickness: 0.85,
		minCameraRatio: 0.18,
	},
	{
		minNodes: 0,
		labelDensity: 0.75,
		labelGridCellSize: 120,
		labelRenderedSizeThreshold: 11,
		stagePadding: 56,
		minEdgeThickness: 0.9,
		minCameraRatio: 0.18,
	},
];

const LOCAL_SIGMA = {
	labelDensity: 1.1,
	labelGridCellSize: 88,
	labelRenderedSizeThreshold: 0,
	stagePadding: 72,
	minEdgeThickness: 0.85,
	minCameraRatio: 0.35,
	maxCameraRatio: 2.2,
	zoomingRatio: 1.7,
};

function tierForCount<T extends { minNodes: number }>(
	tiers: readonly T[],
	count: number,
) {
	return (
		tiers.find((tier) => count >= tier.minNodes) ?? tiers[tiers.length - 1]
	);
}

interface ConnectionsDensityProfile {
	noteSizeRange: SpaceNodeSizeRange;
	tagSizeRange: SpaceNodeSizeRange;
	edgeScale: number;
}

export function spaceConnectionsDensityProfile(
	nodeCount: number,
	edgeCount: number,
): ConnectionsDensityProfile {
	const nodeTier = tierForCount(SPACE_NODE_DENSITY_TIERS, nodeCount);

	return {
		noteSizeRange: nodeTier.noteSize,
		tagSizeRange: nodeTier.tagSize,
		edgeScale:
			SPACE_EDGE_SCALE_TIERS.find((tier) => edgeCount >= tier.minEdges)
				?.scale ?? 1,
	};
}

export function sigmaSettingsForVariant(
	variant: ConnectionsGraphVariant,
	edgeCount: number,
	nodeCount = 0,
) {
	if (variant === "local") {
		return {
			renderLabels: true,
			renderEdgeLabels: false,
			enableEdgeEvents: false,
			hideLabelsOnMove: true,
			hideEdgesOnMove: edgeCount > 5000,
			labelDensity: LOCAL_SIGMA.labelDensity,
			labelGridCellSize: LOCAL_SIGMA.labelGridCellSize,
			labelRenderedSizeThreshold: LOCAL_SIGMA.labelRenderedSizeThreshold,
			defaultNodeType: "circle",
			defaultEdgeType: "line",
			minCameraRatio: LOCAL_SIGMA.minCameraRatio,
			maxCameraRatio: LOCAL_SIGMA.maxCameraRatio,
			stagePadding: LOCAL_SIGMA.stagePadding,
			zoomingRatio: LOCAL_SIGMA.zoomingRatio,
			minEdgeThickness: LOCAL_SIGMA.minEdgeThickness,
			zIndex: true,
			allowInvalidContainer: false,
		};
	}

	const sigmaTier = tierForCount(SPACE_SIGMA_TIERS, nodeCount);

	return {
		renderLabels: true,
		renderEdgeLabels: false,
		enableEdgeEvents: false,
		hideLabelsOnMove: true,
		hideEdgesOnMove: edgeCount > 5000,
		labelDensity: sigmaTier.labelDensity,
		labelGridCellSize: sigmaTier.labelGridCellSize,
		labelRenderedSizeThreshold: sigmaTier.labelRenderedSizeThreshold,
		defaultNodeType: "circle",
		defaultEdgeType: "line",
		minCameraRatio: sigmaTier.minCameraRatio,
		maxCameraRatio: 2.1,
		stagePadding: sigmaTier.stagePadding,
		zoomingRatio: 1.6,
		minEdgeThickness: sigmaTier.minEdgeThickness,
		zIndex: true,
		allowInvalidContainer: false,
	};
}
