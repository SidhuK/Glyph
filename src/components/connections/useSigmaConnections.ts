import { type RefObject, useEffect, useRef } from "react";
import Sigma from "sigma";
import { connectionsLabelVisibility } from "../../lib/connectionsGraphOptions";
import {
	drawConnectionsNodeHover,
	drawConnectionsNodeLabel,
} from "./connectionsCanvas";
import { sigmaSettingsForVariant } from "./connectionsDensity";
import type {
	ConnectionsEdgeAttributes,
	ConnectionsGraph,
	ConnectionsGraphVariant,
	ConnectionsNodeAttributes,
} from "./connectionsGraph";
import {
	type ConnectionsDisplayState,
	type ConnectionsFocusState,
	type ConnectionsPalette,
	buildEdgeReducer,
	buildNodeReducer,
	resolveConnectionsPalette,
} from "./connectionsTheme";

interface UseSigmaConnectionsOptions {
	graph: ConnectionsGraph | null;
	containerRef: RefObject<HTMLDivElement | null>;
	variant: ConnectionsGraphVariant;
	enabled: boolean;
	display: ConnectionsDisplayState;
	labelZoomThreshold: number;
	searchMatchIds?: ReadonlySet<string> | null;
	onNoteOpen?: (nodeId: string) => void;
	onTagActivate?: (tagId: string, label: string) => void;
}

export interface ConnectionsOverlayApi {
	setSearchMatches: (matchIds: ReadonlySet<string> | null) => void;
	setDisplay: (display: ConnectionsDisplayState) => void;
	setLabelZoomThreshold: (value: number) => void;
}

function neighborIdsForNode(graph: ConnectionsGraph, nodeId: string | null) {
	if (!nodeId) return null;
	const neighbors = new Set(graph.neighbors(nodeId));
	neighbors.add(nodeId);
	return neighbors;
}

function isEdgeConnectedToFocus(
	focusId: string | null,
	source: string,
	target: string,
) {
	if (!focusId) return false;
	return source === focusId || target === focusId;
}

function fitGraphToViewport(
	renderer: Sigma<ConnectionsNodeAttributes, ConnectionsEdgeAttributes>,
) {
	const { width, height } = renderer.getDimensions();
	if (width <= 0 || height <= 0) return;

	renderer.getCamera().setState({
		x: 0.5,
		y: 0.5,
		ratio: 1,
		angle: 0,
	});
	renderer.refresh();
}

export function useSigmaConnections({
	graph,
	containerRef,
	variant,
	enabled,
	display,
	labelZoomThreshold,
	searchMatchIds = null,
	onNoteOpen,
	onTagActivate,
}: UseSigmaConnectionsOptions): RefObject<ConnectionsOverlayApi> {
	const focusRef = useRef<ConnectionsFocusState>({
		hoveredNode: null,
		neighborIds: null,
		selectedNodeId: null,
		searchMatchIds: null,
	});
	const displayRef = useRef(display);
	displayRef.current = display;
	const labelZoomRef = useRef(labelZoomThreshold);
	labelZoomRef.current = labelZoomThreshold;
	const searchMatchIdsRef = useRef(searchMatchIds);
	searchMatchIdsRef.current = searchMatchIds;
	const paletteRef = useRef<ConnectionsPalette | null>(null);
	const refreshScheduledRef = useRef(false);
	const overlayRef = useRef<ConnectionsOverlayApi>({
		setSearchMatches: () => {},
		setDisplay: () => {},
		setLabelZoomThreshold: () => {},
	});

	useEffect(() => {
		if (!enabled || !graph || graph.order === 0) return;
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;
		let renderer: Sigma<
			ConnectionsNodeAttributes,
			ConnectionsEdgeAttributes
		> | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let themeObserver: MutationObserver | null = null;
		let fitFrame = 0;

		const cleanup = () => {
			disposed = true;
			if (fitFrame) window.cancelAnimationFrame(fitFrame);
			themeObserver?.disconnect();
			resizeObserver?.disconnect();
			renderer?.kill();
			focusRef.current.hoveredNode = null;
			focusRef.current.neighborIds = null;
			focusRef.current.selectedNodeId = null;
			overlayRef.current = {
				setSearchMatches: () => {},
				setDisplay: () => {},
				setLabelZoomThreshold: () => {},
			};
		};

		const setup = () => {
			if (disposed) return;
			if (container.clientWidth <= 0 || container.clientHeight <= 0) {
				fitFrame = window.requestAnimationFrame(setup);
				return;
			}

			const palette = resolveConnectionsPalette(container);
			paletteRef.current = palette;

			const focusState = focusRef.current;
			let draggedNode: string | null = null;
			let didDrag = false;

			const scheduleRefresh = (
				activeRenderer: Sigma<
					ConnectionsNodeAttributes,
					ConnectionsEdgeAttributes
				>,
			) => {
				if (refreshScheduledRef.current) return;
				refreshScheduledRef.current = true;
				window.requestAnimationFrame(() => {
					refreshScheduledRef.current = false;
					if (disposed) return;
					activeRenderer.refresh({ skipIndexation: true });
				});
			};

			const setFocus = (
				activeRenderer: Sigma<
					ConnectionsNodeAttributes,
					ConnectionsEdgeAttributes
				>,
				next: Partial<ConnectionsFocusState>,
			) => {
				if (next.hoveredNode !== undefined) {
					focusState.hoveredNode = next.hoveredNode;
				}
				if (next.selectedNodeId !== undefined) {
					focusState.selectedNodeId = next.selectedNodeId;
				}
				if (next.searchMatchIds !== undefined) {
					focusState.searchMatchIds = next.searchMatchIds;
				}
				const focusId = focusState.selectedNodeId ?? focusState.hoveredNode;
				focusState.neighborIds = neighborIdsForNode(graph, focusId);
				scheduleRefresh(activeRenderer);
			};

			const sigmaSettings = sigmaSettingsForVariant(
				variant,
				graph.size,
				graph.order,
			);
			const labelFont = getComputedStyle(container).fontFamily;
			const nodeReducer = buildNodeReducer(
				() => paletteRef.current ?? palette,
				variant,
				() => focusState,
				() => displayRef.current,
			);
			const edgeReducer = buildEdgeReducer(
				() => paletteRef.current ?? palette,
				() => focusState,
				() => displayRef.current,
				(source, target) =>
					isEdgeConnectedToFocus(
						focusState.selectedNodeId ?? focusState.hoveredNode,
						source,
						target,
					),
			);

			const activeRenderer = new Sigma<
				ConnectionsNodeAttributes,
				ConnectionsEdgeAttributes
			>(graph, container, {
				...sigmaSettings,
				...(variant === "space"
					? connectionsLabelVisibility(labelZoomRef.current)
					: {}),
				labelColor: { color: palette.text },
				labelFont,
				labelSize: variant === "local" ? 11.5 : 10.5,
				labelWeight: "500",
				defaultDrawNodeLabel: (context, data, labelSettings) =>
					drawConnectionsNodeLabel(
						context,
						data,
						labelSettings,
						paletteRef.current ?? palette,
						variant,
					),
				defaultDrawNodeHover: (context, data) =>
					drawConnectionsNodeHover(
						context,
						data,
						paletteRef.current ?? palette,
						variant,
					),
				nodeReducer: (node, data) =>
					nodeReducer(node, {
						...data,
						x: graph.getNodeAttribute(node, "x"),
						y: graph.getNodeAttribute(node, "y"),
					}),
				edgeReducer: (edge, data) => {
					const source = graph.source(edge);
					const target = graph.target(edge);
					return edgeReducer(edge, data, source, target);
				},
			});
			renderer = activeRenderer;

			const fitToView = () => {
				if (disposed) return;
				fitGraphToViewport(activeRenderer);
			};

			fitToView();
			fitFrame = window.requestAnimationFrame(fitToView);

			overlayRef.current = {
				setSearchMatches: (matchIds) => {
					setFocus(activeRenderer, {
						searchMatchIds: matchIds ? new Set(matchIds) : null,
					});
				},
				setDisplay: (nextDisplay) => {
					displayRef.current = nextDisplay;
					scheduleRefresh(activeRenderer);
				},
				setLabelZoomThreshold: (value) => {
					activeRenderer.setSettings(connectionsLabelVisibility(value));
					scheduleRefresh(activeRenderer);
				},
			};

			overlayRef.current.setSearchMatches(searchMatchIdsRef.current);

			activeRenderer.on("enterNode", ({ node }) => {
				setFocus(activeRenderer, { hoveredNode: node });
			});
			activeRenderer.on("leaveNode", () => {
				if (focusState.selectedNodeId) return;
				setFocus(activeRenderer, { hoveredNode: null });
			});
			activeRenderer.on("clickNode", ({ node }) => {
				if (didDrag) return;
				setFocus(activeRenderer, {
					selectedNodeId: node,
					hoveredNode: node,
				});
				const kind = graph.getNodeAttribute(node, "kind");
				if (kind === "tag") {
					onTagActivate?.(node, graph.getNodeAttribute(node, "label"));
					return;
				}
				onNoteOpen?.(node);
			});
			activeRenderer.on("clickStage", () => {
				setFocus(activeRenderer, { hoveredNode: null, selectedNodeId: null });
			});

			activeRenderer.on("downNode", ({ node }) => {
				if (graph.getNodeAttribute(node, "isCenter")) return;
				draggedNode = node;
				didDrag = false;
				activeRenderer.getCamera().disable();
			});

			const mouseCaptor = activeRenderer.getMouseCaptor();
			const handleMouseMove = (coords: { x: number; y: number }) => {
				if (!draggedNode) return;
				didDrag = true;
				const position = activeRenderer.viewportToGraph(coords);
				graph.setNodeAttribute(draggedNode, "x", position.x);
				graph.setNodeAttribute(draggedNode, "y", position.y);
			};
			const handleMouseUp = () => {
				if (!draggedNode) return;
				draggedNode = null;
				activeRenderer.getCamera().enable();
			};

			mouseCaptor.on("mousemovebody", handleMouseMove);
			mouseCaptor.on("mouseup", handleMouseUp);

			resizeObserver = new ResizeObserver(() => {
				activeRenderer.resize();
				fitToView();
			});
			resizeObserver.observe(container);

			themeObserver = new MutationObserver(() => {
				const nextPalette = resolveConnectionsPalette(container);
				paletteRef.current = nextPalette;
				activeRenderer.setSettings({
					labelColor: { color: nextPalette.text },
					labelFont: getComputedStyle(container).fontFamily,
				});
				scheduleRefresh(activeRenderer);
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
		};

		setup();

		return cleanup;
	}, [containerRef, enabled, graph, onNoteOpen, onTagActivate, variant]);

	return overlayRef;
}
