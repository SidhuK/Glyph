import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { type ConnectionsCommunityTone } from "./connectionsCommunities";
import { LOCAL_FOCUS_NODE_SIZE } from "./connectionsDensity";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsEdgeTone,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
} from "./connectionsGraph";
import {
	type ConnectionsDisplayState,
	type ConnectionsFocusState,
	type ConnectionsPalette,
	SPACE_FOCUS_NODE_SCALE,
	withAlpha,
} from "./connectionsTheme";

/** Unfocused edges drop to this share of the link opacity while a node is focused. */
const FADED_EDGE_ALPHA_SCALE = 0.2;
const HIGHLIGHTED_EDGE_Z_INDEX = 1;
/** Space-graph focus edges take the focused community's hue at this alpha and width, not black ink. */
const FOCUS_EDGE_ALPHA = 0.78;
const FOCUS_EDGE_SIZE = 1.25;
/** Space-graph community edges are drawn at this share of the link opacity (~15% by default). */
const COMMUNITY_EDGE_ALPHA_SCALE = 0.38;
/**
 * Unlinked notes rest in the page colour (the unlinked band draws them as one quiet mark) but stay
 * hoverable; a hovered or matched one shows in full.
 */
const ISOLATED_NODE_SIZE_SCALE = 0.45;
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

export function isLabeledHub({ community }: ConnectionsNodeAttributes) {
	return community.kind === "member" && community.isHub && community.tone.kind === "hue";
}

function isIsolated({ community }: ConnectionsNodeAttributes) {
	return community.kind === "member" && community.isolated;
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

		// Unlinked notes recede until hovered, selected, or matched by search.
		if (isIsolated(data) && !isFocus && !isSearchMatch) {
			color = palette.background;
			size *= ISOLATED_NODE_SIZE_SCALE;
			label = "";
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
				? (palette.communityEdges[tone.tone.hue] ?? palette.edgeDefault)
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
		const { hoveredNode, selectedNodeId, searchMatchIds, focusTone } = getFocusState();
		const activeFocusId = selectedNodeId ?? hoveredNode;
		const matchEdge = searchMatchIds?.has(source) && searchMatchIds.has(target);
		const isHighlighted = searchMatchIds === null && isEdgeInFocus(source, target);
		const isFaded = searchMatchIds !== null ? !matchEdge : Boolean(activeFocusId) && !isHighlighted;
		const baseColor = edgeColorForTone(data.tone, palette);

		const alphaScale = data.tone.kind === "community" ? COMMUNITY_EDGE_ALPHA_SCALE : 1;
		let color = withAlpha(baseColor, display.linkOpacity * alphaScale);
		let size = data.size * display.linkThicknessScale;
		let zIndex = 0;

		if (isHighlighted) {
			color = focusTone
				? withAlpha(communityToneColor(focusTone, palette), FOCUS_EDGE_ALPHA)
				: palette.accent;
			size = focusTone ? FOCUS_EDGE_SIZE : Math.max(size, 1.5);
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
