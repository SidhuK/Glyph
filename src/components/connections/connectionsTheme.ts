import type { ConnectionsGraphVariant } from "./connectionsGraph";
import {
	CONNECTIONS_COMMUNITY_HUE_VARIABLES,
	type ConnectionsCommunityTone,
} from "./connectionsCommunities";

/** Community edges keep only this much of their hue; the rest is the grey edge ink. */
const COMMUNITY_EDGE_HUE_WEIGHT = 0.35;
/** The hovered or selected node's label steps up to this weight. */
export const FOCUS_LABEL_WEIGHT = "500";
/** Space-graph nodes grow by this factor while focused. */
export const SPACE_FOCUS_NODE_SCALE = 1.15;

export interface ConnectionsPalette {
	accent: string;
	/** Graph surface; translucent looks are mixed into it because sigma's WebGL blend ignores alpha. */
	background: string;
	text: string;
	/** Resting label ink; labels switch to `text` only while hovered or selected. */
	textSecondary: string;
	note: string;
	tag: string;
	/** Indexed by `ConnectionsCommunityHue`. */
	communities: readonly string[];
	/** Community hues pulled toward the grey edge ink, indexed like `communities`. */
	communityEdges: readonly string[];
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
	/** Community tone of the hovered or selected space-graph node; null for local graphs. */
	focusTone: ConnectionsCommunityTone | null;
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

/** Resolves a UI type-scale token to pixels so labels follow the user's UI font size. */
export function resolveConnectionsLabelSize(
	container: HTMLElement,
	variant: ConnectionsGraphVariant,
) {
	const [token, fallback] = variant === "local" ? ["--text-xs", 12] : ["--text-2xs", 11];
	const probe = document.createElement("span");
	probe.style.cssText = `font-size: ${fallback}px; font-size: var(${token});`;
	container.appendChild(probe);
	const size = Number.parseFloat(getComputedStyle(probe).fontSize);
	probe.remove();
	return Number.isFinite(size) && size > 0 ? size : fallback;
}

function parseRgb(color: string): [number, number, number] | null {
	const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
	if (!rgb) return null;
	return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

function mixRgb(color: string, base: string, weight: number) {
	const from = parseRgb(color);
	const to = parseRgb(base);
	if (!from || !to) return color;
	const [red, green, blue] = from.map((channel, index) =>
		Math.round(channel * weight + (to[index] ?? channel) * (1 - weight)),
	);
	return `rgb(${red}, ${green}, ${blue})`;
}

export function withAlpha(color: string, alpha: number) {
	const clamped = Math.min(1, Math.max(0, alpha));
	const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
	if (!rgb) return color;
	return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${Math.round(clamped * 1000) / 1000})`;
}

export function resolveConnectionsPalette(container: HTMLElement): ConnectionsPalette {
	const accent = cssColor(container, "--interactive-accent", "#888888");
	const background = cssColor(container, "--bg-primary", "#ffffff");
	const text = cssColor(container, "--text-primary", "#1f2328");
	const textSecondary = cssColor(container, "--text-secondary", "#59636e");
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
		background,
		text,
		textSecondary,
		note,
		tag,
		communities,
		communityEdges: communities.map((color) =>
			mixRgb(color, edgeDefault, COMMUNITY_EDGE_HUE_WEIGHT),
		),
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
