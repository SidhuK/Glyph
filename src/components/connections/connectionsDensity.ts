import type { ConnectionsGraphVariant } from "./connectionsGraph";

export const LOCAL_CENTER_NODE_SIZE = 14;
export const LOCAL_FOCUS_NODE_SIZE = 18;

type SpaceNodeSizeRange = readonly [min: number, max: number];

interface SpaceDensityTier {
	minNodes: number;
	noteSize: SpaceNodeSizeRange;
	tagSize: SpaceNodeSizeRange;
	layoutCandidateCount: number;
}

const SPACE_NODE_DENSITY_TIERS: readonly SpaceDensityTier[] = [
	{
		minNodes: 10_000,
		noteSize: [0.35, 1.4],
		tagSize: [0.55, 2],
		layoutCandidateCount: 5,
	},
	{
		minNodes: 5_000,
		noteSize: [0.5, 1.8],
		tagSize: [0.7, 2.4],
		layoutCandidateCount: 8,
	},
	{
		minNodes: 2_000,
		noteSize: [0.7, 2.4],
		tagSize: [0.95, 3.2],
		layoutCandidateCount: 8,
	},
	{
		minNodes: 1_000,
		noteSize: [1, 3.2],
		tagSize: [1.3, 4.2],
		layoutCandidateCount: 8,
	},
	{
		minNodes: 400,
		noteSize: [1.4, 4.5],
		tagSize: [1.8, 5.5],
		layoutCandidateCount: 8,
	},
	{
		minNodes: 0,
		noteSize: [2.5, 8],
		tagSize: [3.5, 10],
		layoutCandidateCount: 8,
	},
];

interface SpaceEdgeScaleTier {
	minEdges: number;
	scale: number;
}

const SPACE_EDGE_SCALE_TIERS: readonly SpaceEdgeScaleTier[] = [
	{ minEdges: 10_000, scale: 0.37 },
	{ minEdges: 5_000, scale: 0.48 },
	{ minEdges: 2_000, scale: 0.6 },
	{ minEdges: 1_000, scale: 0.72 },
	{ minEdges: 400, scale: 0.84 },
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
		minEdgeThickness: 0.32,
		minCameraRatio: 0.05,
	},
	{
		minNodes: 1_000,
		labelDensity: 0.22,
		labelGridCellSize: 200,
		labelRenderedSizeThreshold: 14,
		stagePadding: 40,
		minEdgeThickness: 0.37,
		minCameraRatio: 0.18,
	},
	{
		minNodes: 150,
		labelDensity: 0.16,
		labelGridCellSize: 165,
		labelRenderedSizeThreshold: 11,
		stagePadding: 48,
		minEdgeThickness: 0.44,
		minCameraRatio: 0.18,
	},
	{
		minNodes: 0,
		labelDensity: 0.75,
		labelGridCellSize: 120,
		labelRenderedSizeThreshold: 11,
		stagePadding: 56,
		minEdgeThickness: 0.44,
		minCameraRatio: 0.18,
	},
];

const LOCAL_SIGMA = {
	labelDensity: 1.1,
	labelGridCellSize: 88,
	labelRenderedSizeThreshold: 0,
	stagePadding: 72,
	minEdgeThickness: 0.52,
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

function tierForEdgeCount(count: number) {
	return SPACE_EDGE_SCALE_TIERS.find((tier) => count >= tier.minEdges) ?? null;
}

interface ConnectionsDensityProfile {
	noteSizeRange: SpaceNodeSizeRange;
	tagSizeRange: SpaceNodeSizeRange;
	edgeScale: number;
	layoutCandidateCount: number;
}

export function spaceConnectionsDensityProfile(
	nodeCount: number,
	edgeCount: number,
): ConnectionsDensityProfile {
	const nodeTier = tierForCount(SPACE_NODE_DENSITY_TIERS, nodeCount);
	const edgeTier = tierForEdgeCount(edgeCount);
	let edgeScale = 1;
	if (edgeTier) {
		edgeScale = edgeTier.scale;
	} else if (nodeCount >= 150) {
		edgeScale = 0.94;
	}

	return {
		noteSizeRange: nodeTier.noteSize,
		tagSizeRange: nodeTier.tagSize,
		edgeScale,
		layoutCandidateCount: nodeTier.layoutCandidateCount,
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
			minEdgeThickness: 0.52,
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
