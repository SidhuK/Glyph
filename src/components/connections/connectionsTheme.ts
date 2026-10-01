import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import {
	CONNECTIONS_COMMUNITY_HUE_VARIABLES,
	type ConnectionsCommunityTone,
} from "./connectionsCommunities";
import { LOCAL_FOCUS_NODE_SIZE } from "./connectionsDensity";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsEdgeTone,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
} from "./connectionsGraph";

/** Unfocused edges drop to this share of the link opacity while a node is focused. */
const FADED_EDGE_ALPHA_SCALE = 0.2;
const HIGHLIGHTED_EDGE_Z_INDEX = 1;
/** Space-graph nodes grow by this factor while focused. */
export const SPACE_FOCUS_NODE_SCALE = 1.15;

export interface ConnectionsPalette {
	accent: string;
	text: string;
	note: string;
	tag: string;
	/** Indexed by `ConnectionsCommunityHue`. */
	communities: readonly string[];
	communityNeutral: string;
	edgeDefault: string;
	edgeInternal: string;
	faded: string;
	labelBackground: string;
	labelBorder: string;
	hoverHalo: string;
	hoverHaloSoft: string;
}

export interface ConnectionsFocusState {
	hoveredNode: string | null;
	neighborIds: Set<string> | null;
	selectedNodeId: string | null;
	searchMatchIds: Set<string> | null;
}

export interface ConnectionsDisplayState {
	nodeSizeScale: number;
	linkOpacity: number;
	linkThicknessScale: number;
	/** 0 draws straight chords, 1 routes edges fully through community bundle points. */
	edgeBundling: number;
}

const sigmaColorContext = document.createElement("canvas").getContext("2d");

function sigmaCompatibleColor(value: string, fallback: string) {
	const context = sigmaColorContext;
	if (!context) return fallback;

	context.canvas.width = 1;
	context.canvas.height = 1;
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = fallback;
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);

	const [red, green, blue, alphaByte] = context.getImageData(0, 0, 1, 1).data;
	if (alphaByte === 255) return `rgb(${red}, ${green}, ${blue})`;
	const alpha = Math.round((alphaByte / 255) * 1000) / 1000;
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function cssColor(element: HTMLElement, name: string, fallback: string) {
	const probe = document.createElement("span");
	probe.style.cssText = `color: ${fallback}; color: var(${name});`;
	element.appendChild(probe);
	const color = getComputedStyle(probe).color.trim();
	probe.remove();
	return sigmaCompatibleColor(color || fallback, fallback);
}

function withAlpha(color: string, alpha: number) {
	const clamped = Math.min(1, Math.max(0, alpha));
	const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
	if (!rgb) return color;
	return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${Math.round(clamped * 1000) / 1000})`;
}

export function resolveConnectionsPalette(container: HTMLElement): ConnectionsPalette {
	const accent = cssColor(container, "--interactive-accent", "#888888");
	const text = cssColor(container, "--text-primary", "#1f2328");
	const note = cssColor(container, "--local-connections-note-bg", "#4269d0");
	const tag = cssColor(container, "--local-connections-tag-node", "#a463f2");
	const communities = CONNECTIONS_COMMUNITY_HUE_VARIABLES.map((variable) =>
		cssColor(container, variable, note),
	);
	const communityNeutral = cssColor(container, "--connections-community-neutral", "#9498a0");
	const edgeDefault = cssColor(container, "--local-connections-edge", "#6e737b");
	const edgeMuted = cssColor(container, "--local-connections-edge-muted", "#9aa0a8");
	const faded = cssColor(container, "--local-connections-node-faded", "#d4d6da");
	const labelBackground = cssColor(
		container,
		"--local-connections-label-bg",
		"rgba(255, 255, 255, 0.86)",
	);
	const labelBorder = cssColor(
		container,
		"--local-connections-label-border",
		"rgba(148, 163, 184, 0.38)",
	);

	return {
		accent,
		text,
		note,
		tag,
		communities,
		communityNeutral,
		edgeDefault,
		edgeInternal: edgeMuted,
		faded,
		labelBackground,
		labelBorder,
		hoverHalo: withAlpha(accent, 0.28),
		hoverHaloSoft: withAlpha(accent, 0.12),
	};
}

function communityToneColor(tone: ConnectionsCommunityTone, palette: ConnectionsPalette) {
	switch (tone.kind) {
		case "hue":
			return palette.communities[tone.hue];
		case "neutral":
			return palette.communityNeutral;
		default: {
			const _exhaustive: never = tone;
			return _exhaustive;
		}
	}
}

function nodeColorForAttributes(attrs: ConnectionsNodeAttributes, palette: ConnectionsPalette) {
	if (attrs.isCenter) return palette.accent;
	if (attrs.kind === "tag") return palette.tag;
	if (attrs.community.kind === "member") return communityToneColor(attrs.community.tone, palette);
	return palette.note;
}

function isLabeledHub({ community }: ConnectionsNodeAttributes) {
	return community.kind === "member" && community.isHub && community.tone.kind === "hue";
}

export function buildNodeReducer(
	getPalette: () => ConnectionsPalette,
	variant: ConnectionsGraphVariant,
	getFocusState: () => ConnectionsFocusState,
	getDisplayState: () => ConnectionsDisplayState,
) {
	return (nodeKey: string, data: ConnectionsNodeAttributes): Partial<NodeDisplayData> => {
		const palette = getPalette();
		const { hoveredNode, neighborIds, selectedNodeId, searchMatchIds } = getFocusState();
		const display = getDisplayState();
		const activeFocusId = selectedNodeId ?? hoveredNode;
		const activeNeighbors = neighborIds;
		const searching = searchMatchIds !== null;
		const isSearchMatch = searching && searchMatchIds.has(nodeKey);
		const isFocus = activeFocusId === nodeKey;
		const isNeighbor = activeNeighbors?.has(nodeKey) ?? false;
		const isFaded = searching ? !isSearchMatch : Boolean(activeFocusId) && !isFocus && !isNeighbor;

		let color = nodeColorForAttributes(data, palette);
		let label = data.label;
		let size = data.size * display.nodeSizeScale;
		let zIndex = isFocus ? 30 : isNeighbor || isSearchMatch ? 20 : 0;
		let forceLabel: boolean | undefined;

		if (isFaded) {
			color = palette.faded;
			label = "";
			zIndex = 0;
		} else if (isFocus) {
			forceLabel = true;
			size = Math.max(
				size,
				variant === "local" ? LOCAL_FOCUS_NODE_SIZE : size * SPACE_FOCUS_NODE_SCALE,
			);
			zIndex = 30;
		} else if (isSearchMatch) {
			forceLabel = true;
			zIndex = 20;
		} else if (activeFocusId && isNeighbor) {
			forceLabel = true;
		} else if (data.isCenter || isLabeledHub(data)) {
			forceLabel = true;
		}

		return {
			x: data.x,
			y: data.y,
			size,
			label,
			color,
			zIndex,
			highlighted: isFocus,
			...(forceLabel ? { forceLabel } : {}),
		};
	};
}

function edgeColorForTone(tone: ConnectionsEdgeTone, palette: ConnectionsPalette) {
	switch (tone.kind) {
		case "default":
			return palette.edgeDefault;
		case "accent":
			return palette.accent;
		case "internal":
			return palette.edgeInternal;
		case "community":
			return tone.tone.kind === "hue"
				? communityToneColor(tone.tone, palette)
				: palette.edgeDefault;
		default: {
			const _exhaustive: never = tone;
			return _exhaustive;
		}
	}
}

export function buildEdgeReducer(
	getPalette: () => ConnectionsPalette,
	getFocusState: () => ConnectionsFocusState,
	getDisplayState: () => ConnectionsDisplayState,
	isEdgeInFocus: (source: string, target: string) => boolean,
) {
	return (
		_edgeKey: string,
		data: ConnectionsEdgeAttributes,
		source: string,
		target: string,
	): Partial<EdgeDisplayData> => {
		const palette = getPalette();
		const display = getDisplayState();
		const { hoveredNode, selectedNodeId, searchMatchIds } = getFocusState();
		const activeFocusId = selectedNodeId ?? hoveredNode;
		const matchEdge = searchMatchIds?.has(source) && searchMatchIds.has(target);
		const isHighlighted = searchMatchIds === null && isEdgeInFocus(source, target);
		const isFaded = searchMatchIds !== null ? !matchEdge : Boolean(activeFocusId) && !isHighlighted;
		const baseColor = edgeColorForTone(data.tone, palette);

		let color = withAlpha(baseColor, display.linkOpacity);
		let size = data.size * display.linkThicknessScale;
		let zIndex = 0;

		if (isHighlighted) {
			color = palette.accent;
			size = Math.max(size, 1.5);
			zIndex = HIGHLIGHTED_EDGE_Z_INDEX;
		}

		if (isFaded) {
			color = withAlpha(palette.edgeInternal, display.linkOpacity * FADED_EDGE_ALPHA_SCALE);
			size = Math.max(0.45, size * 0.7);
		}

		return {
			color,
			size,
			zIndex,
		};
	};
}
