import type { EdgeDisplayData, NodeDisplayData } from "sigma/types";
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
	edgeRelationship: string;
	edgeAccent: string;
	edgeIncoming: string;
	edgeInternal: string;
	edgeTag: string;
	faded: string;
}

export interface ConnectionsFocusState {
	hoveredNode: string | null;
	neighborIds: Set<string> | null;
	selectedTagId: string | null;
}

function sigmaCompatibleColor(value: string, fallback: string) {
	const context = document.createElement("canvas").getContext("2d");
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
	const accent = cssColor(container, "--interactive-accent", "#5b8def");
	const text = cssColor(
		container,
		"--local-connections-text",
		"#1f2328",
	);
	const note = cssColor(container, "--local-connections-note-bg", "#dce6f8");
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
		"rgba(102, 112, 133, 0.3)",
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
	const edgeIncoming = cssColor(
		container,
		"--local-connections-edge-incoming",
		text,
	);
	const edgeMuted = cssColor(
		container,
		"--local-connections-edge-muted",
		"rgba(102, 112, 133, 0.12)",
	);
	const faded = cssColor(
		container,
		"--local-connections-node-faded",
		noteMuted,
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
		edgeRelationship: edgeIncoming,
		edgeAccent,
		edgeIncoming,
		edgeInternal: edgeMuted,
		edgeTag,
		faded,
	};
}

export function sigmaSettingsForVariant(
	variant: ConnectionsGraphVariant,
	edgeCount: number,
	nodeCount = 0,
) {
	const isLocal = variant === "local";
	const hugeSpace = !isLocal && nodeCount >= 5000;
	const largeSpace = !isLocal && nodeCount >= 1000;
	const mediumSpace = !isLocal && nodeCount >= 150;
	return {
		renderLabels: true,
		renderEdgeLabels: false,
		enableEdgeEvents: false,
		hideLabelsOnMove: true,
		hideEdgesOnMove: edgeCount > 5000,
		labelDensity: isLocal
			? 1.2
			: hugeSpace
				? 0.1
				: largeSpace
					? 0.28
					: mediumSpace
						? 0.2
						: 0.9,
		labelGridCellSize: isLocal
			? 90
			: hugeSpace
				? 260
				: largeSpace
					? 180
					: mediumSpace
						? 150
						: 110,
		labelRenderedSizeThreshold: isLocal
			? 0
			: hugeSpace
				? 16
				: largeSpace
					? 12
					: mediumSpace
						? 10
						: 6,
		defaultNodeType: "circle",
		defaultEdgeType: "line",
		minCameraRatio: isLocal ? 0.35 : hugeSpace ? 0.05 : 0.18,
		maxCameraRatio: isLocal ? 2.2 : 2.1,
		stagePadding: isLocal
			? 72
			: hugeSpace
				? 36
				: largeSpace
					? 40
					: mediumSpace
						? 48
						: 56,
		zoomingRatio: isLocal ? 1.7 : 1.6,
		minEdgeThickness: isLocal
			? 0.5
			: hugeSpace
				? 0.45
				: largeSpace
					? 0.55
					: 0.65,
		zIndex: true,
		allowInvalidContainer: false,
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
	palette: ConnectionsPalette,
	variant: ConnectionsGraphVariant,
	getFocusState: () => ConnectionsFocusState,
) {
	return (
		nodeKey: string,
		data: ConnectionsNodeAttributes,
	): Partial<NodeDisplayData> => {
		const { hoveredNode, neighborIds, selectedTagId } = getFocusState();
		const activeFocusId = selectedTagId ?? hoveredNode;
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
			size = Math.max(data.size, variant === "local" ? 24 : data.size);
			zIndex = 30;
			if (data.isCenter && variant === "local") {
				color = palette.center;
			}
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
		case "incoming":
			return palette.edgeIncoming;
		case "internal":
			return palette.edgeInternal;
		case "tag":
			return palette.edgeTag;
		case "relationship":
			return palette.edgeRelationship;
		default:
			return palette.edgeDefault;
	}
}

export function buildEdgeReducer(
	palette: ConnectionsPalette,
	getFocusState: () => ConnectionsFocusState,
	isEdgeInFocus: (source: string, target: string) => boolean,
) {
	return (
		_edgeKey: string,
		data: ConnectionsEdgeAttributes,
		source: string,
		target: string,
	): Partial<EdgeDisplayData> => {
		const { hoveredNode, selectedTagId } = getFocusState();
		const activeFocusId = selectedTagId ?? hoveredNode;
		const isHighlighted = isEdgeInFocus(source, target);
		const isFaded = Boolean(activeFocusId) && !isHighlighted;
		const baseColor = edgeColorForRole(data.colorRole, palette);

		let color = baseColor;
		let size = data.size;

		if (isHighlighted) {
			color = palette.edgeAccent;
			size = Math.max(data.size, 1.8);
		}

		if (isFaded) {
			color = palette.edgeInternal;
			size = Math.max(0.5, data.size * 0.65);
		}

		return {
			color,
			size,
			type: data.type,
		};
	};
}
