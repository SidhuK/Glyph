import cytoscape, {
	type Core,
	type ElementDefinition,
	type StylesheetJson,
} from "cytoscape";
import fcose from "cytoscape-fcose";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalNoteGraph } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { dispatchWikiLinkClick } from "../editor/markdown/editorEvents";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "../ui/shadcn/dialog";

interface LocalNoteGraphDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	noteId: string;
	graphRefreshKey?: number;
}

interface GraphTheme {
	accent: string;
	background: string;
	border: string;
	edge: string;
	edgeIncoming: string;
	edgeInternal: string;
	nodeActiveBorder: string;
	node: string;
	nodeActive: string;
	nodeCenter: string;
	text: string;
	textInverse: string;
	textMuted: string;
}

let fcoseRegistered = false;

function registerFcose() {
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
		nodeCenter: accent,
		text,
		textInverse,
		textMuted,
	};
}

function nodeClasses(node: LocalNoteGraph["nodes"][number], weight: number) {
	const classes = [];
	if (node.is_center) {
		classes.push("center");
	} else if (weight >= 5) {
		classes.push("hub-strong");
	} else if (weight >= 3) {
		classes.push("hub");
	} else if (weight >= 2) {
		classes.push("connected");
	}
	return classes.join(" ");
}

function graphElements(graph: LocalNoteGraph): ElementDefinition[] {
	const degreeById = new Map(graph.nodes.map((node) => [node.id, 0]));
	const edgeKeys = new Set(
		graph.edges.map((edge) => `${edge.source}->${edge.target}`),
	);
	for (const edge of graph.edges) {
		degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
		degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
	}
	for (const edge of graph.tag_edges) {
		degreeById.set(edge.note_id, (degreeById.get(edge.note_id) ?? 0) + 1);
	}

	return [
		...graph.nodes.map((node) => ({
			data: {
				id: node.id,
				label: node.title || node.id,
				weight: degreeById.get(node.id) ?? 0,
			},
			classes: nodeClasses(node, degreeById.get(node.id) ?? 0),
			grabbable: !node.is_center,
		})),
		...graph.tags.map((tag) => ({
			data: {
				id: tag.id,
				label: tag.title,
				noteCount: tag.note_count,
				tag: tag.tag,
			},
			classes: tag.note_count >= 4 ? "tag tag-strong" : "tag",
			grabbable: true,
		})),
		...graph.edges.map((edge, index) => {
			const classes = ["link"];
			if (edge.source === graph.center.id) {
				classes.push("from-center");
			} else if (edge.target === graph.center.id) {
				classes.push("to-center");
			} else {
				classes.push("internal");
			}
			if (edgeKeys.has(`${edge.target}->${edge.source}`)) {
				classes.push("reciprocal");
			}

			return {
				data: {
					id: `${edge.source}->${edge.target}:${index}`,
					source: edge.source,
					target: edge.target,
				},
				classes: classes.join(" "),
			};
		}),
		...graph.tag_edges.map((edge, index) => ({
			data: {
				id: `${edge.tag_id}->${edge.note_id}:tag:${index}`,
				source: edge.tag_id,
				target: edge.note_id,
			},
			classes: "tag-link",
		})),
	];
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

function graphLayoutSpacing(cy: Core) {
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

function runGraphLayout(cy: Core) {
	const spacing = graphLayoutSpacing(cy);
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

function highlightNeighborhood(cy: Core, nodeId: string | null) {
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

function applyGraphTheme(cy: Core, container: HTMLElement) {
	cy.style(graphStyles(graphThemeFor(container)));
}

export function LocalNoteGraphDialog({
	open,
	onOpenChange,
	noteId,
	graphRefreshKey = 0,
}: LocalNoteGraphDialogProps) {
	const [graph, setGraph] = useState<LocalNoteGraph | null>(null);
	const [error, setError] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const cyRef = useRef<Core | null>(null);

	const openNode = useCallback(
		(nodeId: string) => {
			dispatchWikiLinkClick({
				raw: `[[${nodeId}]]`,
				target: nodeId,
				alias: null,
				anchorKind: "none",
				anchor: null,
				unresolved: false,
			});
			onOpenChange(false);
		},
		[onOpenChange],
	);

	useEffect(() => {
		if (!open || !noteId) return;
		void graphRefreshKey;
		let cancelled = false;
		setGraph(null);
		setError("");

		void invoke("note_local_graph", { note_id: noteId })
			.then((nextGraph) => {
				if (cancelled) return;
				setGraph(nextGraph);
			})
			.catch((cause) => {
				if (cancelled) return;
				setGraph(null);
				setError(cause instanceof Error ? cause.message : String(cause));
			});

		return () => {
			cancelled = true;
		};
	}, [graphRefreshKey, noteId, open]);

	useEffect(() => {
		if (!open || !graph || error) return;
		const container = containerRef.current;
		if (!container) return;

		registerFcose();

		const cy = cytoscape({
			boxSelectionEnabled: false,
			container,
			elements: graphElements(graph),
			maxZoom: 2.2,
			minZoom: 0.35,
			style: graphStyles(graphThemeFor(container)),
			userZoomingEnabled: true,
			wheelSensitivity: 0.18,
		});
		cyRef.current = cy;
		runGraphLayout(cy);

		cy.on("mouseover", "node", (event) => {
			highlightNeighborhood(cy, event.target.id());
		});
		cy.on("mouseout", "node", () => {
			highlightNeighborhood(cy, null);
		});
		cy.on("tap", "node", (event) => {
			if (event.target.hasClass("tag")) {
				highlightNeighborhood(cy, event.target.id());
				return;
			}
			openNode(event.target.id());
		});
		cy.on("tap", (event) => {
			if (event.target === cy) {
				highlightNeighborhood(cy, null);
			}
		});

		const observer = new ResizeObserver(() => {
			cy.resize();
			cy.fit(undefined, graphLayoutSpacing(cy).padding);
		});
		observer.observe(container);

		const themeObserver = new MutationObserver(() => {
			applyGraphTheme(cy, container);
		});
		themeObserver.observe(document.documentElement, {
			attributeFilter: [
				"class",
				"data-light-theme",
				"data-dark-theme",
				"style",
			],
			attributes: true,
		});

		return () => {
			themeObserver.disconnect();
			observer.disconnect();
			cy.destroy();
			cyRef.current = null;
		};
	}, [error, graph, open, openNode]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="localNoteGraphDialog" showCloseButton={false}>
				<DialogTitle className="sr-only">Connected Notes</DialogTitle>

				<div className="localNoteGraphBody">
					<DialogClose asChild>
						<button
							type="button"
							className="localNoteGraphClose"
							aria-label="Close graph"
						>
							×
						</button>
					</DialogClose>
					{error ? (
						<div className="localNoteGraphState">
							Could not load graph: {error}
						</div>
					) : (
						<div className="localNoteGraphStage">
							<div
								ref={containerRef}
								className="localNoteGraphViewport"
								aria-label="Connected notes graph"
							/>
							<div className="localNoteGraphLegend" aria-label="Graph legend">
								<span className="localNoteGraphLegendItem">
									<span
										className="localNoteGraphLegendNode is-current"
										aria-hidden="true"
									/>
									Open note
								</span>
								<span className="localNoteGraphLegendItem">
									<span
										className="localNoteGraphLegendNode is-note"
										aria-hidden="true"
									/>
									Note
								</span>
								<span className="localNoteGraphLegendItem">
									<span
										className="localNoteGraphLegendNode is-tag"
										aria-hidden="true"
									/>
									Tag
								</span>
								<span className="localNoteGraphLegendItem">
									<span
										className="localNoteGraphLegendEdge is-link"
										aria-hidden="true"
									/>
									Note link
								</span>
								<span className="localNoteGraphLegendItem">
									<span
										className="localNoteGraphLegendEdge is-tag-link"
										aria-hidden="true"
									/>
									Shares tag
								</span>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
