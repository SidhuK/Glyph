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

function cssValue(styles: CSSStyleDeclaration, name: string, fallback: string) {
	return styles.getPropertyValue(name).trim() || fallback;
}

function graphThemeFor(element: HTMLElement): GraphTheme {
	const styles = getComputedStyle(element);
	const accent = cssValue(styles, "--interactive-accent", "#5b8def");
	const background = cssValue(styles, "--bg-secondary", "#f6f6f4");
	const node = cssValue(styles, "--bg-primary", "#ffffff");
	const text = cssValue(styles, "--text-primary", "#1f2328");
	const textInverse = cssValue(styles, "--text-inverse", "#ffffff");
	const textMuted = cssValue(styles, "--text-secondary", "#667085");
	const border = cssValue(styles, "--border-default", "#d7d7d2");

	return {
		accent,
		background,
		border,
		edge: textMuted,
		nodeActiveBorder: accent,
		node,
		nodeActive: node,
		nodeCenter: accent,
		text,
		textInverse,
		textMuted,
	};
}

function graphElements(graph: LocalNoteGraph): ElementDefinition[] {
	const degreeById = new Map(graph.nodes.map((node) => [node.id, 0]));
	for (const edge of graph.edges) {
		degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
		degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
	}

	return [
		...graph.nodes.map((node) => ({
			data: {
				id: node.id,
				label: node.title || node.id,
				weight: degreeById.get(node.id) ?? 0,
			},
			classes: node.is_center ? "center" : "",
			grabbable: !node.is_center,
		})),
		...graph.edges.map((edge, index) => ({
			data: {
				id: `${edge.source}->${edge.target}:${index}`,
				source: edge.source,
				target: edge.target,
			},
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
				color: theme.text,
				"font-family": "var(--font-ui)",
				"font-size": 13,
				"font-weight": 500,
				height: "label",
				label: "data(label)",
				"line-height": 1.25,
				"min-height": "34px",
				"min-width": "58px",
				"overlay-opacity": 0,
				padding: "12px",
				shape: "round-rectangle",
				"text-events": "yes",
				"text-halign": "center",
				"text-max-width": "190px",
				"text-wrap": "ellipsis",
				"text-valign": "center",
				"transition-duration": 120,
				"transition-property": "background-color, border-color, opacity",
				width: "label",
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
				"min-height": "42px",
				"min-width": "76px",
				padding: "15px",
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
				"line-color": theme.edge,
				opacity: 0.28,
				"transition-duration": 120,
				"transition-property": "opacity",
				width: 1.35,
			},
		},
		{
			selector: ".is-faded",
			style: {
				opacity: 0.16,
			},
		},
	];
}

function runGraphLayout(cy: Core) {
	cy.layout({
		name: "fcose",
		animate: true,
		animationDuration: 240,
		fit: true,
		idealEdgeLength: 130,
		nodeDimensionsIncludeLabels: true,
		nodeRepulsion: 8000,
		padding: 56,
		quality: "default",
		randomize: false,
	} as cytoscape.LayoutOptions).run();
}

function highlightNeighborhood(cy: Core, nodeId: string | null) {
	const elements = cy.elements();
	elements.removeClass("is-faded is-focus is-neighbor");
	if (!nodeId) return;

	const node = cy.getElementById(nodeId);
	if (node.empty()) return;

	const neighborhood = node.closedNeighborhood();
	elements.not(neighborhood).addClass("is-faded");
	node.addClass("is-focus");
	node.neighborhood("node").addClass("is-neighbor");
}

export function LocalNoteGraphDialog({
	open,
	onOpenChange,
	noteId,
	graphRefreshKey = 0,
}: LocalNoteGraphDialogProps) {
	const [graph, setGraph] = useState<LocalNoteGraph | null>(null);
	const [loading, setLoading] = useState(false);
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
		setLoading(true);
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
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [graphRefreshKey, noteId, open]);

	useEffect(() => {
		if (!open || !graph || loading || error) return;
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
			openNode(event.target.id());
		});
		cy.on("tap", (event) => {
			if (event.target === cy) {
				highlightNeighborhood(cy, null);
			}
		});

		const observer = new ResizeObserver(() => {
			cy.resize();
			cy.fit(undefined, 56);
		});
		observer.observe(container);

		return () => {
			observer.disconnect();
			cy.destroy();
			cyRef.current = null;
		};
	}, [error, graph, loading, open, openNode]);

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
							x
						</button>
					</DialogClose>
					{loading ? (
						<div className="localNoteGraphState">
							Loading note connections...
						</div>
					) : null}
					{!loading && error ? (
						<div className="localNoteGraphState">
							Could not load graph: {error}
						</div>
					) : null}
					{!loading && !error ? (
						<div
							ref={containerRef}
							className="localNoteGraphViewport"
							aria-label="Connected notes graph"
						/>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
