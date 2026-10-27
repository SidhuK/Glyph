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
	type ConnectionsFocusMode,
	type ConnectionsFocusState,
	type ConnectionsPalette,
	connectionsFocusMode,
	createConnectionsToner,
} from "./connectionsTheme";

/** Share of ink kept by nodes outside the hovered or selected neighbourhood. */
export const CONNECTIONS_DIM_WEIGHT = 0.12;
/** Share of ink kept per focus mode by nodes outside the focus; labels of muted hubs keep a little more. */
const NODE_MUTE: Record<Exclude<ConnectionsFocusMode, "rest">, number> = {
	path: 0.1,
	lens: CONNECTIONS_DIM_WEIGHT,
	search: 0.3,
};
const HUB_LABEL_LIFT = 0.18;
/** Share of edge rest ink kept per focus mode by edges outside the focus. */
const EDGE_MUTE: Record<Exclude<ConnectionsFocusMode, "rest">, number> = {
	path: 0.15,
	lens: 0.3,
	search: 0.5,
};
/** A hover during an active path lifts its neighbourhood only this far, so the path still leads. */
const PATH_HOVER_LIFT = 0.4;
/** Search matches outside the hovered or selected neighbourhood keep this share of the accent. */
const SEARCH_OUTSIDE_LENS = 0.4;
/** Link opacity slider share applied to the edge ink. */
const EDGE_INK_SCALE = 0.5;
const MAX_CURVATURE = 0.4;
const SELECTED_NODE_SCALE = 1.3;
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

export function isConnectionsNodeHidden(
	{ community, unlinked }: ConnectionsNodeAttributes,
	focus: ConnectionsFocusState,
) {
	if (unlinked && !focus.showUnlinked) return true;
	return community !== null && focus.hiddenCommunities.has(community);
}

function connectionsDisplayLabel({ kind, label }: ConnectionsNodeAttributes) {
	return kind === "tag" && !label.startsWith("#") ? `#${label}` : label;
}

/** Node the hover-or-selection lens centres on; hover temporarily replaces the selection. */
function lensNode(graph: ConnectionsGraph, focus: ConnectionsFocusState) {
	const id = focus.hoveredNode ?? focus.selectedNodeId;
	return id !== null && graph.hasNode(id) ? id : null;
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
		const base = { x: data.x, y: data.y, rank: data.rank, kind: data.kind };
		if (isConnectionsNodeHidden(data, focus)) {
			return { ...base, hidden: true, ink: palette.text, strong: false };
		}

		const mode = connectionsFocusMode(focus);
		const resting = data.kind === "tag" ? palette.textSecondary : palette.text;
		const accent: NodeStyle = {
			color: palette.accent,
			ink: palette.accent,
			strong: true,
			labelled: true,
			forceLabel: true,
			zIndex: 3,
		};
		const focused: NodeStyle = {
			...accent,
			color: resting,
			ink: resting,
			strong: false,
			zIndex: 2,
		};
		const muted = (weight: number, color = palette.text): NodeStyle => ({
			color: tone(palette, color, weight),
			ink: tone(palette, palette.text, weight + HUB_LABEL_LIFT),
			strong: false,
			labelled: data.rank === "hub",
			forceLabel: false,
			zIndex: 0,
		});

		const selected = focus.selectedNodeId === node;
		const matched = focus.searchMatchIds?.has(node) ?? false;
		let highlighted = selected;
		let style: NodeStyle;
		if (mode === "path") {
			const onPath = focus.pathIds?.has(node) ?? false;
			const lifted = muted(PATH_HOVER_LIFT, resting);
			highlighted = selected && onPath;
			if (onPath) style = accent;
			else if (focus.hoveredNode === node) style = { ...lifted, ink: lifted.color, labelled: true };
			else if (focus.hoverIds?.has(node)) style = { ...lifted, zIndex: 1 };
			else style = muted(NODE_MUTE.path);
		} else if (mode === "lens") {
			const inLens = inNeighbourhood(graph, lensNode(graph, focus), node);
			if (selected) style = inLens ? accent : { ...accent, labelled: false, forceLabel: false };
			else if (matched) style = inLens ? accent : muted(SEARCH_OUTSIDE_LENS, palette.accent);
			else style = inLens ? focused : muted(NODE_MUTE.lens);
		} else if (mode === "search") {
			style = matched ? accent : muted(NODE_MUTE.search);
		} else {
			const ink = data.rank === "dot" ? palette.textSecondary : resting;
			style = {
				color: data.rank === "dot" && data.kind === "note" ? palette.textTertiary : resting,
				ink,
				strong: false,
				labelled: data.rank !== "dot" || focus.dotLabels,
				forceLabel: data.rank === "hub",
				zIndex: 1,
			};
		}

		const { labelled, ...rest } = style;
		return {
			...base,
			...rest,
			size: data.size * getDisplay().nodeSizeScale * (highlighted ? SELECTED_NODE_SCALE : 1),
			label: labelled ? connectionsDisplayLabel(data) : null,
			highlighted,
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
		if (
			isConnectionsNodeHidden(graph.getNodeAttributes(source), focus) ||
			isConnectionsNodeHidden(graph.getNodeAttributes(target), focus)
		) {
			return { hidden: true, curvature };
		}

		const mode = connectionsFocusMode(focus);
		const size = data.size * display.linkThicknessScale;
		const ink = tone(palette, palette.text, display.linkOpacity * EDGE_INK_SCALE);
		const touches = (id: string | null) => id === source || id === target;
		if (mode === "path") {
			if (focus.pathPairs?.has(connectionsPairKey(source, target))) {
				const pathSize = Math.max(PATH_EDGE_MIN_SIZE, size * PATH_EDGE_SCALE);
				return { color: palette.accent, size: pathSize, zIndex: 2, curvature };
			}
			if (touches(focus.hoveredNode)) {
				return { color: tone(palette, ink, PATH_HOVER_LIFT), size, zIndex: 1, curvature };
			}
		} else if (mode === "lens") {
			if (touches(lensNode(graph, focus))) {
				return { color: palette.text, size: Math.max(1, size), zIndex: 1, curvature };
			}
		} else if (mode === "rest") {
			return { color: ink, size, zIndex: 0, curvature };
		} else if (focus.searchMatchIds?.has(source) && focus.searchMatchIds.has(target)) {
			return { color: ink, size, zIndex: 1, curvature };
		}
		return { color: tone(palette, ink, EDGE_MUTE[mode]), size, zIndex: 0, curvature };
	};
}
