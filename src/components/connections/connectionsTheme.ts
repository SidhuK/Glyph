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
	noteMuted: string;
	tag: string;
	tagMuted: string;
	center: string;
	edgeDefault: string;
	edgeAccent: string;
	edgeInternal: string;
	edgeTag: string;
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

export function resolveConnectionsPalette(
	container: HTMLElement,
): ConnectionsPalette {
	const accent = cssColor(container, "--interactive-accent", "#888888");
	const text = cssColor(container, "--local-connections-text", "#1f2328");
	const note = cssColor(container, "--local-connections-note-bg", "#b8bcc4");
	const noteMuted = cssColor(
		container,
		"--local-connections-note-muted",
		"#d7d7d2",
	);
	const tag = cssColor(container, "--local-connections-tag-node", accent);
	const tagMuted = cssColor(
		container,
		"--local-connections-tag-muted",
		noteMuted,
	);
	const edgeDefault = cssColor(
		container,
		"--local-connections-edge",
		"#a8b0bc",
	);
	const edgeAccent = cssColor(
		container,
		"--local-connections-edge-active",
		accent,
	);
	const edgeTag = cssColor(
		container,
		"--local-connections-edge-tag",
		edgeDefault,
	);
	const edgeMuted = cssColor(
		container,
		"--local-connections-edge-muted",
		"#c8cdd4",
	);
	const faded = cssColor(
		container,
		"--local-connections-node-faded",
		noteMuted,
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
	const hoverHalo = cssColor(
		container,
		"--local-connections-hover-halo",
		"rgba(136, 136, 136, 0.28)",
	);
	const hoverHaloSoft = cssColor(
		container,
		"--local-connections-hover-halo-soft",
		"rgba(136, 136, 136, 0.12)",
	);

	return {
		accent,
		text,
		note,
		noteMuted,
		tag,
		tagMuted,
		center: accent,
		edgeDefault,
		edgeAccent,
		edgeInternal: edgeMuted,
		edgeTag,
		faded,
		labelBackground,
		labelBorder,
		hoverHalo,
		hoverHaloSoft,
	};
}

function nodeColorForAttributes(
	attrs: ConnectionsNodeAttributes,
	palette: ConnectionsPalette,
) {
	if (attrs.isCenter) return palette.center;
	if (attrs.isIsolated) {
		return attrs.kind === "tag" ? palette.tagMuted : palette.noteMuted;
	}
	if (attrs.kind === "tag") return palette.tag;
	return palette.note;
}

export function buildNodeReducer(
	getPalette: () => ConnectionsPalette,
	variant: ConnectionsGraphVariant,
	getFocusState: () => ConnectionsFocusState,
) {
	return (
		nodeKey: string,
		data: ConnectionsNodeAttributes,
	): Partial<NodeDisplayData> => {
		const palette = getPalette();
		const { hoveredNode, neighborIds, selectedNodeId } = getFocusState();
		const activeFocusId = selectedNodeId ?? hoveredNode;
		const activeNeighbors = neighborIds;
		const isFocus = activeFocusId === nodeKey;
		const isNeighbor = activeNeighbors?.has(nodeKey) ?? false;
		const isFaded = Boolean(activeFocusId) && !isFocus && !isNeighbor;

		let color = nodeColorForAttributes(data, palette);
		let label = data.label;
		let size = data.size;
		let zIndex = isFocus ? 30 : isNeighbor ? 20 : 0;
		let forceLabel: boolean | undefined;

		if (isFaded) {
			color = palette.faded;
			label = "";
			zIndex = 0;
		} else if (isFocus) {
			forceLabel = true;
			size = Math.max(
				data.size,
				variant === "local" ? LOCAL_FOCUS_NODE_SIZE : data.size * 1.15,
			);
			zIndex = 30;
			if (data.isCenter && variant === "local") {
				color = palette.center;
			}
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
	switch (role) {
		case "accent":
			return palette.edgeAccent;
		case "internal":
			return palette.edgeInternal;
		case "tag":
			return palette.edgeTag;
		default:
			return palette.edgeDefault;
	}
}

export function buildEdgeReducer(
	getPalette: () => ConnectionsPalette,
	_variant: ConnectionsGraphVariant,
	getFocusState: () => ConnectionsFocusState,
	isEdgeInFocus: (source: string, target: string) => boolean,
) {
	return (
		_edgeKey: string,
		data: ConnectionsEdgeAttributes,
		source: string,
		target: string,
	): Partial<EdgeDisplayData> => {
		const palette = getPalette();
		const { hoveredNode, selectedNodeId } = getFocusState();
		const activeFocusId = selectedNodeId ?? hoveredNode;
		const isHighlighted = isEdgeInFocus(source, target);
		const isFaded = Boolean(activeFocusId) && !isHighlighted;
		const baseColor = edgeColorForRole(data.colorRole, palette);

		let color = baseColor;
		let size = data.size;

		if (isHighlighted) {
			color = palette.edgeAccent;
			size = Math.max(data.size, 1.7);
		}

		if (isFaded) {
			color = palette.edgeInternal;
			size = Math.max(0.28, data.size * 0.6);
		}

		return {
			color,
			size,
		};
	};
}
