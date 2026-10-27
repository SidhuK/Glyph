import type { ConnectionsGraphVariant } from "./connectionsGraph";

/** Opaque inks: sigma's WebGL programs ignore alpha, so translucent tokens are flattened onto the page. */
export interface ConnectionsPalette {
	background: string;
	text: string;
	textSecondary: string;
	textTertiary: string;
	accent: string;
}

export interface ConnectionsFocusState {
	hoveredNode: string | null;
	/** Hovered node plus its neighbours. */
	hoverIds: Set<string> | null;
	selectedNodeId: string | null;
	searchMatchIds: Set<string> | null;
	pathIds: Set<string> | null;
	/** Unordered `connectionsPairKey` of each consecutive path step. */
	pathPairs: Set<string> | null;
	hiddenCommunities: ReadonlySet<number>;
	showUnlinked: boolean;
	/** True once the camera is zoomed past the dot-label threshold. */
	dotLabels: boolean;
}

/**
 * Highest focus wins: a path of two or more notes, then the hovered or selected neighbourhood
 * ("lens"), then search matches.
 */
export type ConnectionsFocusMode = "path" | "lens" | "search" | "rest";

export function connectionsFocusMode(focus: ConnectionsFocusState): ConnectionsFocusMode {
	if ((focus.pathIds?.size ?? 0) >= 2) return "path";
	if (focus.hoveredNode !== null || focus.selectedNodeId !== null) return "lens";
	return focus.searchMatchIds ? "search" : "rest";
}

export interface ConnectionsDisplayState {
	nodeSizeScale: number;
	linkOpacity: number;
	linkThicknessScale: number;
	/** 0 draws straight links, 1 the strongest curve. */
	curvature: number;
}

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const colorContext = document.createElement("canvas").getContext("2d");

function parseColor(value: string): Rgba | null {
	const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
}

function canvasColor(value: string, fallback: string) {
	if (!colorContext) return fallback;
	colorContext.canvas.width = 1;
	colorContext.canvas.height = 1;
	colorContext.clearRect(0, 0, 1, 1);
	colorContext.fillStyle = fallback;
	colorContext.fillStyle = value;
	colorContext.fillRect(0, 0, 1, 1);
	const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
	return `rgba(${red}, ${green}, ${blue}, ${Math.round((alpha / 255) * 1000) / 1000})`;
}

/** Blends `color` over `base`; weight 1 keeps `color`, 0 returns `base`. */
export function mixColors(color: string, base: string, weight: number) {
	const from = parseColor(color);
	const to = parseColor(base);
	if (!from || !to) return color;
	const amount = Math.min(1, Math.max(0, weight)) * from[3];
	const channel = (index: number) => Math.round(from[index] * amount + to[index] * (1 - amount));
	return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/** Blends toward the palette background, cached per palette; reducers run on every refresh. */
export function createConnectionsToner() {
	let palette: ConnectionsPalette | null = null;
	const cache = new Map<string, string>();
	return (current: ConnectionsPalette, color: string, weight: number) => {
		if (current !== palette) {
			palette = current;
			cache.clear();
		}
		const key = `${color}|${weight}`;
		const cached = cache.get(key);
		if (cached) return cached;
		const mixed = mixColors(color, current.background, weight);
		cache.set(key, mixed);
		return mixed;
	};
}

function cssColor(element: HTMLElement, name: string, fallback: string) {
	const probe = document.createElement("span");
	probe.style.cssText = `color: ${fallback}; color: var(${name});`;
	element.appendChild(probe);
	const color = getComputedStyle(probe).color.trim();
	probe.remove();
	return canvasColor(color || fallback, fallback);
}

export function resolveConnectionsPalette(container: HTMLElement): ConnectionsPalette {
	const background = mixColors(
		cssColor(container, "--bg-primary", "#ffffff"),
		"rgb(255, 255, 255)",
		1,
	);
	const flat = (name: string, fallback: string) =>
		mixColors(cssColor(container, name, fallback), background, 1);
	const text = flat("--text-primary", "#1f2328");
	return {
		background,
		text,
		textSecondary: flat("--text-secondary", "#59636e"),
		textTertiary: flat("--text-tertiary", "#8c959f"),
		accent: flat("--interactive-accent", "#1f2328"),
	};
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
