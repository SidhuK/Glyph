import cytoscape, { type Core, type StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";

interface GraphTheme {
	accent: string;
	background: string;
	border: string;
	edge: string;
	edgeIncoming: string;
	edgeInternal: string;
	node: string;
	nodeActive: string;
	nodeActiveBorder: string;
	tagNode: string;
	text: string;
	textInverse: string;
	textMuted: string;
}

let fcoseRegistered = false;

export function registerFcose() {
	if (fcoseRegistered) return;
	try {
		cytoscape.use(fcose);
	} catch (error) {
		if (!(error instanceof Error) || !error.message.includes("already")) {
			throw error;
		}
	}
	fcoseRegistered = true;
}

function normalizeCssColor(value: string) {
	const context = document.createElement("canvas").getContext("2d");
	if (!context) return value;

	context.fillStyle = "#123456";
	context.fillStyle = value;
	const normalized = context.fillStyle;
	context.fillStyle = "#abcdef";
	context.fillStyle = value;
	const normalizedFromSecondSentinel = context.fillStyle;

	return normalized === "#123456" && normalizedFromSecondSentinel === "#abcdef"
		? value
		: normalized;
}

function cssColor(element: HTMLElement, name: string, fallback: string) {
	const probe = document.createElement("span");
	probe.style.cssText = `color: ${fallback}; color: var(${name});`;
	element.appendChild(probe);
	const color = getComputedStyle(probe).color.trim();
	probe.remove();

	return normalizeCssColor(color || fallback);
}

function graphThemeFor(element: HTMLElement): GraphTheme {
	const accent = cssColor(element, "--interactive-accent", "#5b8def");
	const background = cssColor(element, "--bg-secondary", "#f6f6f4");
	const node = cssColor(element, "--bg-primary", "#ffffff");
	const text = cssColor(element, "--text-primary", "#1f2328");
	const textInverse = cssColor(
		element,
		"--local-graph-text-inverse",
		"#ffffff",
	);
	const textMuted = cssColor(element, "--text-secondary", "#667085");
	const border = cssColor(element, "--local-graph-border", "#d7d7d2");
	const edgeIncoming = cssColor(
		element,
		"--local-graph-edge-incoming",
		"#1f2328",
	);
	const tagNode = cssColor(element, "--local-graph-tag-node", accent);

	return {
		accent,
		background,
		border,
		edge: textMuted,
		edgeIncoming,
		edgeInternal: border,
		node,
		nodeActive: node,
		nodeActiveBorder: accent,
		tagNode,
		text,
		textInverse,
		textMuted,
	};
}

function graphStyles(theme: GraphTheme): StylesheetJson {
	return [
		{
			selector: "core",
			style: {
				"active-bg-color": theme.accent,
				"active-bg-opacity": 0.08,
				"active-bg-size": 18,
				"outside-texture-bg-color": theme.background,
				"outside-texture-bg-opacity": 0,
				"selection-box-border-color": theme.accent,
				"selection-box-border-width": 1,
				"selection-box-color": theme.accent,
				"selection-box-opacity": 0.12,
			},
		},
		{
			selector: "node",
			style: {
				"background-color": theme.accent,
				"background-opacity": 0.28,
				"border-color": theme.nodeActiveBorder,
				"border-width": 1,
				color: theme.text,
				"font-family": "var(--font-ui)",
				"font-size": 10,
				"font-weight": 400,
				height: "data(size)",
				label: "",
				"line-height": 1.3,
				"overlay-opacity": 0,
				shape: "ellipse",
				"text-events": "yes",
				"text-halign": "center",
				"text-margin-y": -10,
				"text-max-width": "150px",
				"text-opacity": 0,
				"text-outline-color": theme.background,
				"text-outline-opacity": 0,
				"text-outline-width": 0,
				"text-wrap": "ellipsis",
				"text-valign": "top",
				"transition-duration": 180,
				"transition-property": "background-color, border-color, opacity",
				width: "data(size)",
			},
		},
		{
			selector: "node.show-label",
			style: {
				color: theme.textMuted,
				"font-size": 9.5,
				"font-weight": 400,
				label: "data(label)",
				"text-opacity": 1,
				"z-compound-depth": "top",
				"z-index": 20,
			},
		},
		{
			selector: "node.connected",
			style: {
				"border-color": theme.nodeActiveBorder,
				"border-width": 1.35,
			},
		},
		{
			selector: "node.hub",
			style: {
				"border-color": theme.nodeActiveBorder,
				"border-width": 1.7,
				"font-size": 12,
				"font-weight": 580,
			},
		},
		{
			selector: "node.hub-strong",
			style: {
				"border-color": theme.nodeActiveBorder,
				"border-width": 2,
				"font-size": 12.5,
				"font-weight": 620,
			},
		},
		{
			selector: "node.isolated",
			style: {
				"background-color": theme.border,
				"background-opacity": 0.32,
				"border-color": theme.textMuted,
				"border-style": "dashed",
				opacity: 0.64,
			},
		},
		{
			selector: "node.tag",
			style: {
				"background-color": theme.tagNode,
				"background-opacity": 0.42,
				"border-color": theme.tagNode,
				"border-style": "dashed",
				"border-width": 1.4,
				color: theme.text,
				"font-size": 12,
				"font-weight": 600,
				"text-max-width": "150px",
			},
		},
		{
			selector: "node.tag-strong",
			style: {
				"border-width": 1.8,
				"font-size": 12.5,
			},
		},
		{
			selector: "node.hover-label",
			style: {
				color: theme.text,
				"font-size": 10,
				"font-weight": 400,
				"text-outline-opacity": 0,
				"text-outline-width": 0,
			},
		},
		{
			selector: "node.is-focus",
			style: {
				"background-color": theme.nodeActive,
				"border-color": theme.nodeActiveBorder,
				"border-width": 2,
				height: 24,
				label: "data(label)",
				"text-opacity": 1,
				width: 24,
				"z-compound-depth": "top",
				"z-index": 30,
			},
		},
		{
			selector: "node.is-neighbor",
			style: {
				"border-color": theme.nodeActiveBorder,
			},
		},
		{
			selector: "edge",
			style: {
				"arrow-scale": 0.8,
				"curve-style": "bezier",
				"line-cap": "round",
				"line-color": theme.edge,
				opacity: 0.28,
				"source-arrow-shape": "none",
				"target-arrow-color": theme.edge,
				"target-arrow-shape": "triangle-backcurve",
				"target-distance-from-node": 4,
				"target-endpoint": "outside-to-node",
				"transition-duration": 180,
				"transition-property": "line-color, opacity, target-arrow-color, width",
				width: 1.35,
			},
		},
		{
			selector: "edge.relationship",
			style: {
				"line-color": theme.edgeIncoming,
				"target-arrow-color": theme.edgeIncoming,
				opacity: 0.36,
				width: 1.55,
			},
		},
		{
			selector: "edge.tag-link",
			style: {
				"arrow-scale": 0.62,
				"curve-style": "bezier",
				"line-cap": "round",
				"line-color": theme.accent,
				"line-dash-pattern": [1, 5],
				"line-style": "dashed",
				opacity: 0.26,
				"source-arrow-shape": "none",
				"target-arrow-color": theme.accent,
				"target-arrow-shape": "triangle-backcurve",
				"target-distance-from-node": 4,
				"target-endpoint": "outside-to-node",
				width: 1.35,
			},
		},
		{
			selector: "edge.is-highlight",
			style: {
				opacity: 0.9,
				width: 2.2,
			},
		},
		{
			selector: ".is-faded",
			style: {
				opacity: 0.12,
			},
		},
	];
}

export function graphLayoutSpacing(cy: Core) {
	const nodeCount = cy.nodes().length;
	const density = Math.min(nodeCount / 1000, 1);
	const idealEdgeLength = Math.round(130 + density * 80);

	return {
		idealEdgeLength,
		nodeRepulsion: Math.round(10_000 + nodeCount * 220),
		nodeSeparation: Math.round(90 + density * 70),
		padding: Math.round(70 + density * 35),
		tilePadding: Math.round(16 + density * 18),
	};
}

interface RunGraphLayoutOptions {
	mode: "fcose" | "preset" | "random";
	afterLayout?: () => void;
}

export function runGraphLayout(cy: Core, options: RunGraphLayoutOptions) {
	const spacing = graphLayoutSpacing(cy);
	if (options.mode === "preset") {
		const layout = cy.layout({
			name: "preset",
			fit: true,
			padding: spacing.padding,
		});
		layout.one("layoutstop", () => {
			options.afterLayout?.();
			cy.fit(undefined, spacing.padding);
		});
		layout.run();
		return;
	}
	if (options.mode === "random") {
		const layout = cy.layout({
			name: "random",
			animate: false,
			fit: true,
			padding: spacing.padding,
		});
		layout.one("layoutstop", () => {
			options.afterLayout?.();
			cy.fit(undefined, spacing.padding);
		});
		layout.run();
		return;
	}

	const layout = cy.layout({
		name: "fcose",
		animate: false,
		fit: true,
		idealEdgeLength: (edge: cytoscape.EdgeSingular) =>
			edge.hasClass("tag-link")
				? spacing.idealEdgeLength + 36
				: spacing.idealEdgeLength,
		nodeDimensionsIncludeLabels: true,
		nodeRepulsion: spacing.nodeRepulsion,
		nodeSeparation: spacing.nodeSeparation,
		numIter: 2200,
		padding: spacing.padding,
		packComponents: false,
		quality: "default",
		randomize: true,
		tile: false,
		tilingPaddingHorizontal: spacing.tilePadding,
		tilingPaddingVertical: spacing.tilePadding,
	} as cytoscape.LayoutOptions);
	layout.one("layoutstop", () => {
		options.afterLayout?.();
		cy.fit(undefined, spacing.padding);
	});
	layout.run();
}

export function highlightNeighborhood(cy: Core, nodeId: string | null) {
	const elements = cy.elements();
	elements.removeClass("is-faded is-focus is-neighbor is-highlight");
	if (!nodeId) return;

	const node = cy.getElementById(nodeId);
	if (node.empty()) return;

	const neighborhood = node.closedNeighborhood();
	elements.not(neighborhood).addClass("is-faded");
	node.addClass("is-focus");
	node.neighborhood("node").addClass("is-neighbor");
	node.connectedEdges().addClass("is-highlight");
}

export function applyGraphTheme(cy: Core, container: HTMLElement) {
	cy.style(graphStyles(graphThemeFor(container)));
}

export function graphStylesForContainer(container: HTMLElement) {
	return graphStyles(graphThemeFor(container));
}

interface LocalNoteGraphTheme extends GraphTheme {
	nodeCenter: string;
}

function localNoteGraphThemeFor(element: HTMLElement): LocalNoteGraphTheme {
	const accent = cssColor(element, "--interactive-accent", "#5b8def");
	const background = cssColor(element, "--bg-secondary", "#f6f6f4");
	const node = cssColor(element, "--local-graph-note-bg", "#ffffff");
	const text = cssColor(element, "--local-graph-text", "#1f2328");
	const textInverse = cssColor(
		element,
		"--local-graph-text-inverse",
		"#ffffff",
	);
	const textMuted = cssColor(element, "--local-graph-edge", "#667085");
	const border = cssColor(element, "--local-graph-border", "#d7d7d2");
	const edgeIncoming = cssColor(
		element,
		"--local-graph-edge-incoming",
		"#1f2328",
	);

	return {
		accent,
		background,
		border,
		edge: textMuted,
		edgeIncoming,
		edgeInternal: border,
		nodeActiveBorder: accent,
		node,
		nodeActive: node,
		tagNode: accent,
		nodeCenter: accent,
		text,
		textInverse,
		textMuted,
	};
}

function localNoteGraphStyles(theme: LocalNoteGraphTheme): StylesheetJson {
	return [
		{
			selector: "core",
			style: {
				"active-bg-color": theme.accent,
				"active-bg-opacity": 0.08,
				"active-bg-size": 18,
				"outside-texture-bg-color": theme.background,
				"outside-texture-bg-opacity": 0,
				"selection-box-border-width": 1,
				"selection-box-border-color": theme.accent,
				"selection-box-color": theme.accent,
				"selection-box-opacity": 0.12,
			},
		},
		{
			selector: "node",
			style: {
				"background-color": theme.node,
				"border-color": theme.border,
				"border-width": 1,
				"corner-radius": "10px",
				color: theme.text,
				"font-family": "var(--font-ui)",
				"font-size": 13,
				"font-weight": 500,
				height: "label",
				label: "data(label)",
				"line-height": 1.3,
				"min-height": "30px",
				"min-width": "54px",
				"overlay-opacity": 0,
				padding: "9px 12px",
				shape: "round-rectangle",
				"text-events": "yes",
				"text-halign": "center",
				"text-max-width": "190px",
				"text-wrap": "ellipsis",
				"text-valign": "center",
				"transition-duration": 180,
				"transition-property":
					"background-color, border-color, border-width, opacity",
				width: "label",
			},
		},
		{
			selector: "node.connected",
			style: {
				"border-color": theme.nodeActiveBorder,
				"border-width": 1.35,
			},
		},
		{
			selector: "node.hub",
			style: {
				"border-color": theme.nodeActiveBorder,
				"border-width": 1.7,
				"font-size": 13.5,
				"font-weight": 580,
				"min-height": "34px",
				"min-width": "64px",
				padding: "10px 12px",
			},
		},
		{
			selector: "node.hub-strong",
			style: {
				"border-color": theme.nodeActiveBorder,
				"border-width": 2,
				"font-size": 14,
				"font-weight": 620,
				"min-height": "38px",
				"min-width": "74px",
				padding: "12px 14px",
			},
		},
		{
			selector: "node.center",
			style: {
				"background-color": theme.nodeCenter,
				"border-color": theme.accent,
				"border-width": 2,
				color: theme.textInverse,
				"font-size": 14,
				"font-weight": 650,
				"min-height": "38px",
				"min-width": "74px",
				padding: "12px 14px",
			},
		},
		{
			selector: "node.tag",
			style: {
				"background-color": theme.background,
				"border-color": theme.nodeActiveBorder,
				"border-style": "dashed",
				"border-width": 1.4,
				color: theme.accent,
				"font-size": 12,
				"font-weight": 600,
				"min-height": "26px",
				"min-width": "44px",
				padding: "7px 9px",
				"text-max-width": "150px",
			},
		},
		{
			selector: "node.tag-strong",
			style: {
				"border-width": 1.8,
				"font-size": 12.5,
				"min-height": "30px",
				"min-width": "52px",
				padding: "8px 10px",
			},
		},
		{
			selector: "node.is-focus",
			style: {
				"background-color": theme.nodeActive,
				"border-color": theme.nodeActiveBorder,
				"border-width": 2,
			},
		},
		{
			selector: "node.center.is-focus",
			style: {
				"background-color": theme.nodeCenter,
				color: theme.textInverse,
			},
		},
		{
			selector: "node.is-neighbor",
			style: {
				"border-color": theme.nodeActiveBorder,
			},
		},
		{
			selector: "edge",
			style: {
				"curve-style": "bezier",
				"line-cap": "round",
				"line-color": theme.edge,
				"source-arrow-shape": "none",
				"target-arrow-color": theme.edge,
				"target-arrow-shape": "triangle-backcurve",
				"target-distance-from-node": 4,
				"target-endpoint": "outside-to-node",
				"arrow-scale": 0.95,
				opacity: 0.32,
				"transition-duration": 180,
				"transition-property": "line-color, opacity, target-arrow-color, width",
				width: 1.6,
			},
		},
		{
			selector: "edge.tag-link",
			style: {
				"curve-style": "bezier",
				"line-cap": "round",
				"line-color": theme.accent,
				"line-style": "dashed",
				"line-dash-pattern": [1, 5],
				"source-arrow-shape": "none",
				"target-arrow-color": theme.accent,
				"target-arrow-shape": "triangle-backcurve",
				"target-distance-from-node": 4,
				"target-endpoint": "outside-to-node",
				"arrow-scale": 0.72,
				opacity: 0.3,
				width: 1.5,
			},
		},
		{
			selector: "edge.from-center",
			style: {
				"line-color": theme.accent,
				"target-arrow-color": theme.accent,
				opacity: 0.62,
				width: 2.2,
			},
		},
		{
			selector: "edge.to-center",
			style: {
				"line-color": theme.edgeIncoming,
				"target-arrow-color": theme.edgeIncoming,
				opacity: 0.46,
				width: 1.9,
			},
		},
		{
			selector: "edge.internal",
			style: {
				"line-color": theme.edgeInternal,
				"target-arrow-color": theme.edgeInternal,
				opacity: 0.4,
				width: 1.6,
			},
		},
		{
			selector: "edge.reciprocal",
			style: {
				"control-point-distance": 34,
				"control-point-weight": 0.5,
				"curve-style": "unbundled-bezier",
			},
		},
		{
			selector: "edge.is-highlight",
			style: {
				opacity: 0.9,
				width: 2.2,
			},
		},
		{
			selector: ".is-faded",
			style: {
				opacity: 0.12,
			},
		},
	];
}

export function localNoteGraphLayoutSpacing(cy: Core) {
	const nodeCount = cy.nodes().length;
	const density = Math.min(nodeCount / 52, 1);
	const idealEdgeLength = Math.round(150 + density * 70);

	return {
		idealEdgeLength,
		nodeRepulsion: Math.round(12_000 + nodeCount * 650),
		nodeSeparation: Math.round(105 + density * 65),
		padding: Math.round(72 + density * 28),
		tilePadding: Math.round(18 + density * 16),
	};
}

export function runLocalNoteGraphLayout(cy: Core) {
	const spacing = localNoteGraphLayoutSpacing(cy);
	const layout = cy.layout({
		name: "fcose",
		animate: false,
		fit: true,
		idealEdgeLength: (edge: cytoscape.EdgeSingular) =>
			edge.hasClass("tag-link")
				? spacing.idealEdgeLength + 36
				: spacing.idealEdgeLength,
		nodeDimensionsIncludeLabels: true,
		nodeRepulsion: spacing.nodeRepulsion,
		nodeSeparation: spacing.nodeSeparation,
		numIter: 3200,
		padding: spacing.padding,
		quality: "proof",
		randomize: true,
		tile: true,
		tilingPaddingHorizontal: spacing.tilePadding,
		tilingPaddingVertical: spacing.tilePadding,
	} as cytoscape.LayoutOptions);
	layout.one("layoutstop", () => {
		cy.fit(undefined, spacing.padding);
	});
	layout.run();
}

export function localNoteGraphStylesForContainer(container: HTMLElement) {
	return localNoteGraphStyles(localNoteGraphThemeFor(container));
}

export function applyLocalNoteGraphTheme(cy: Core, container: HTMLElement) {
	cy.style(localNoteGraphStyles(localNoteGraphThemeFor(container)));
}
