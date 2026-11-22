import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsGraph,
	ConnectionsNodeAttributes,
	ConnectionsNodeKind,
	ConnectionsNodeRank,
} from "./connectionsGraph";
import {
	type ConnectionsDisplayState,
	type ConnectionsFocusState,
	type ConnectionsPalette,
	connectionsFocusMode,
	createConnectionsToner,
} from "./connectionsTheme";

export const CONNECTIONS_FADE = 0.35;
const SELECTED_EDGE_INK = 0.6;
const EDGE_INK_SCALE = 0.5;
const MAX_CURVATURE = 0.4;
const PATH_EDGE_MIN_SIZE = 2;
const PATH_EDGE_SCALE = 2;

/** Extra fields the label drawers read alongside sigma's display data. */
interface ConnectionsNodeDisplay extends Partial<NodeDisplayData> {
	rank: ConnectionsNodeRank;
	kind: ConnectionsNodeKind;
	ink: string;
	/** Draws the label at title weight. */
	strong: boolean;
}

interface ConnectionsEdgeDisplay extends Partial<EdgeDisplayData> {
	curvature: number;
}

interface NodeStyle {
	color: string;
	ink: string;
	strong: boolean;
	labelled: boolean;
	forceLabel: boolean;
	zIndex: number;
}

export function connectionsPairKey(a: string, b: string) {
	return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function connectionsDisplayLabel({ kind, label }: ConnectionsNodeAttributes) {
	return kind === "tag" && !label.startsWith("#") ? `#${label}` : label;
}

function inNeighbourhood(graph: ConnectionsGraph, center: string | null, node: string) {
	return center !== null && (center === node || graph.areNeighbors(center, node));
}

export function buildNodeReducer(
	graph: ConnectionsGraph,
	getPalette: () => ConnectionsPalette,
	getFocus: () => ConnectionsFocusState,
	getDisplay: () => ConnectionsDisplayState,
) {
	const tone = createConnectionsToner();
	return (node: string, data: ConnectionsNodeAttributes): ConnectionsNodeDisplay => {
		const palette = getPalette();
		const focus = getFocus();
		const selected = focus.selectedNodeId === node;
		const resting: NodeStyle = {
			color: data.linked ? palette.textSecondary : palette.textTertiary,
			ink: palette.text,
			strong: data.isCenter,
			labelled: data.rank !== "dot" || focus.dotLabels,
			forceLabel: data.rank === "hub",
			zIndex: 1,
		};
		const neighbour: NodeStyle = { ...resting, labelled: true, forceLabel: true, zIndex: 2 };
		const accent: NodeStyle = {
			...neighbour,
			color: palette.accent,
			strong: selected || data.isCenter,
			zIndex: 3,
		};
		const faded = (style: NodeStyle): NodeStyle => ({
			...style,
			color: tone(palette, style.color, CONNECTIONS_FADE),
			ink: tone(palette, palette.textTertiary, CONNECTIONS_FADE),
			strong: false,
			labelled: resting.labelled,
			forceLabel: false,
			zIndex: 0,
		});

		const matched = focus.searchMatchIds?.has(node) ?? false;
		let style: NodeStyle;
		switch (connectionsFocusMode(focus)) {
			case "path":
				style = focus.pathIds?.has(node) ? accent : faded(resting);
				break;
			case "lens":
				if (selected) style = accent;
				else if (inNeighbourhood(graph, focus.selectedNodeId, node))
					style = matched ? accent : neighbour;
				else style = faded(matched ? accent : resting);
				break;
			case "search":
				style = matched ? accent : faded(resting);
				break;
			case "rest":
				style = resting;
				break;
		}

		const { labelled, ...rest } = style;
		return {
			x: data.x,
			y: data.y,
			rank: data.rank,
			kind: data.kind,
			...rest,
			size: data.size * getDisplay().nodeSizeScale,
			label: labelled ? connectionsDisplayLabel(data) : null,
			highlighted: selected,
		};
	};
}

export function buildEdgeReducer(
	graph: ConnectionsGraph,
	getPalette: () => ConnectionsPalette,
	getFocus: () => ConnectionsFocusState,
	getDisplay: () => ConnectionsDisplayState,
) {
	const tone = createConnectionsToner();
	return (edge: string, data: ConnectionsEdgeAttributes): ConnectionsEdgeDisplay => {
		const palette = getPalette();
		const focus = getFocus();
		const display = getDisplay();
		const curvature = MAX_CURVATURE * display.curvature;
		const [source, target] = graph.extremities(edge);
		const size = data.size * display.linkThicknessScale;
		const ink = tone(palette, palette.text, display.linkOpacity * EDGE_INK_SCALE);
		const faded = { color: tone(palette, ink, CONNECTIONS_FADE), size, zIndex: 0, curvature };

		switch (connectionsFocusMode(focus)) {
			case "path":
				if (!focus.pathPairs?.has(connectionsPairKey(source, target))) return faded;
				return {
					color: palette.accent,
					size: Math.max(PATH_EDGE_MIN_SIZE, size * PATH_EDGE_SCALE),
					zIndex: 2,
					curvature,
				};
			case "lens":
				if (source !== focus.selectedNodeId && target !== focus.selectedNodeId) return faded;
				return {
					color: tone(palette, palette.accent, SELECTED_EDGE_INK),
					size: Math.max(1, size),
					zIndex: 1,
					curvature,
				};
			case "search":
				if (!focus.searchMatchIds?.has(source) || !focus.searchMatchIds.has(target)) return faded;
				return { color: ink, size, zIndex: 1, curvature };
			case "rest":
				return { color: ink, size, zIndex: 0, curvature };
		}
	};
}
