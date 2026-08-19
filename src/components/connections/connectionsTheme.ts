import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { LOCAL_FOCUS_NODE_SIZE } from "./connectionsDensity";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
} from "./connectionsGraph";

export interface ConnectionsPalette {
	accent: string;
	text: string;
	note: string;
	tag: string;
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
	const rgb = color.match(
		/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
	);
	if (!rgb) return color;
	return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${Math.round(clamped * 1000) / 1000})`;
}

export function resolveConnectionsPalette(
	container: HTMLElement,
): ConnectionsPalette {
	const accent = cssColor(container, "--interactive-accent", "#888888");
	const text = cssColor(container, "--text-primary", "#1f2328");
	const note = cssColor(container, "--local-connections-note-bg", "#4269d0");
	const tag = cssColor(container, "--local-connections-tag-node", "#a463f2");
	const edgeDefault = cssColor(
		container,
		"--local-connections-edge",
		"#6e737b",
	);
	const edgeMuted = cssColor(
		container,
		"--local-connections-edge-muted",
		"#9aa0a8",
	);
	const faded = cssColor(
		container,
		"--local-connections-node-faded",
		"#d4d6da",
	);
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
		edgeDefault,
		edgeInternal: edgeMuted,
		faded,
		labelBackground,
		labelBorder,
		hoverHalo: withAlpha(accent, 0.28),
		hoverHaloSoft: withAlpha(accent, 0.12),
	};
}

function nodeColorForAttributes(
	attrs: ConnectionsNodeAttributes,
	palette: ConnectionsPalette,
) {
	if (attrs.isCenter) return palette.accent;
	if (attrs.kind === "tag") return palette.tag;
	return palette.note;
}

export function buildNodeReducer(
	getPalette: () => ConnectionsPalette,
	variant: ConnectionsGraphVariant,
	getFocusState: () => ConnectionsFocusState,
	getDisplayState: () => ConnectionsDisplayState,
) {
	return (
		nodeKey: string,
		data: ConnectionsNodeAttributes,
	): Partial<NodeDisplayData> => {
		const palette = getPalette();
		const { hoveredNode, neighborIds, selectedNodeId, searchMatchIds } =
			getFocusState();
		const display = getDisplayState();
		const activeFocusId = selectedNodeId ?? hoveredNode;
		const activeNeighbors = neighborIds;
		const searching = searchMatchIds !== null;
		const isSearchMatch = searching && searchMatchIds.has(nodeKey);
		const isFocus = activeFocusId === nodeKey;
		const isNeighbor = activeNeighbors?.has(nodeKey) ?? false;
		const isFaded = searching
			? !isSearchMatch
			: Boolean(activeFocusId) && !isFocus && !isNeighbor;

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
				variant === "local" ? LOCAL_FOCUS_NODE_SIZE : size * 1.15,
			);
			zIndex = 30;
		} else if (isSearchMatch) {
			forceLabel = true;
			zIndex = 20;
		} else if (activeFocusId && isNeighbor) {
			forceLabel = true;
		} else if (data.isCenter) {
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

function edgeColorForRole(
	role: ConnectionsEdgeAttributes["colorRole"],
	palette: ConnectionsPalette,
) {
	if (role === "internal") return palette.edgeInternal;
	if (role === "accent") return palette.accent;
	return palette.edgeDefault;
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
		const isHighlighted =
			searchMatchIds === null && isEdgeInFocus(source, target);
		const isFaded =
			searchMatchIds !== null
				? !matchEdge
				: Boolean(activeFocusId) && !isHighlighted;
		const baseColor = edgeColorForRole(data.colorRole, palette);

		let color = withAlpha(baseColor, display.linkOpacity);
		let size = data.size * display.linkThicknessScale;

		if (isHighlighted) {
			color = palette.accent;
			size = Math.max(size, 1.5);
		}

		if (isFaded) {
			color = withAlpha(palette.edgeInternal, display.linkOpacity * 0.7);
			size = Math.max(0.45, size * 0.7);
		}

		return {
			color,
			size,
		};
	};
}
