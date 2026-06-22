import { type RefObject, useEffect, useRef } from "react";
import Sigma from "sigma";
import { EdgeLineProgram } from "sigma/rendering";
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
	onNoteOpen?: (nodeId: string) => void;
	onTagSelect?: (tagId: string | null) => void;
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

	// Sigma normalizes graph coordinates before applying the camera. Its reset
	// state therefore fits the full graph using the configured stage padding.
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
	onNoteOpen,
	onTagSelect,
}: UseSigmaConnectionsOptions) {
	const focusRef = useRef<ConnectionsFocusState>({
		hoveredNode: null,
		neighborIds: null,
		selectedTagId: null,
	});
	const paletteRef = useRef<ConnectionsPalette | null>(null);
	const refreshScheduledRef = useRef(false);

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
			focusRef.current.selectedTagId = null;
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
				if (next.selectedTagId !== undefined) {
					focusState.selectedTagId = next.selectedTagId;
				}
				const focusId = focusState.selectedTagId ?? focusState.hoveredNode;
				focusState.neighborIds = neighborIdsForNode(graph, focusId);
				scheduleRefresh(activeRenderer);
			};

			const sigmaSettings = sigmaSettingsForVariant(
				variant,
				graph.size,
				graph.order,
			);
			const labelFont = getComputedStyle(container).fontFamily;

			const activeRenderer = new Sigma<
				ConnectionsNodeAttributes,
				ConnectionsEdgeAttributes
			>(graph, container, {
				...sigmaSettings,
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
				edgeProgramClasses: {
					line: EdgeLineProgram,
					"tag-line": EdgeLineProgram,
				},
				nodeReducer: (node, data) =>
					buildNodeReducer(
						paletteRef.current ?? palette,
						variant,
						() => focusState,
					)(node, {
						...data,
						x: graph.getNodeAttribute(node, "x"),
						y: graph.getNodeAttribute(node, "y"),
					}),
				edgeReducer: (edge, data) => {
					const source = graph.source(edge);
					const target = graph.target(edge);
					return buildEdgeReducer(
						paletteRef.current ?? palette,
						variant,
						() => focusState,
						(sourceId, targetId) =>
							isEdgeConnectedToFocus(
								focusState.selectedTagId ?? focusState.hoveredNode,
								sourceId,
								targetId,
							),
					)(edge, data, source, target);
				},
			});
			renderer = activeRenderer;

			const fitToView = () => {
				if (disposed) return;
				fitGraphToViewport(activeRenderer);
			};

			fitToView();
			fitFrame = window.requestAnimationFrame(fitToView);

			activeRenderer.on("enterNode", ({ node }) => {
				setFocus(activeRenderer, { hoveredNode: node });
			});
			activeRenderer.on("leaveNode", () => {
				if (focusState.selectedTagId) return;
				setFocus(activeRenderer, { hoveredNode: null });
			});
			activeRenderer.on("clickNode", ({ node }) => {
				const kind = graph.getNodeAttribute(node, "kind");
				if (kind === "tag") {
					const nextSelected = focusState.selectedTagId === node ? null : node;
					onTagSelect?.(nextSelected);
					setFocus(activeRenderer, {
						selectedTagId: nextSelected,
						hoveredNode: nextSelected,
					});
					return;
				}
				onNoteOpen?.(node);
			});
			activeRenderer.on("clickStage", () => {
				onTagSelect?.(null);
				setFocus(activeRenderer, { hoveredNode: null, selectedTagId: null });
			});

			activeRenderer.on("downNode", ({ node }) => {
				if (graph.getNodeAttribute(node, "isCenter")) return;
				draggedNode = node;
				activeRenderer.getCamera().disable();
			});

			const mouseCaptor = activeRenderer.getMouseCaptor();
			const handleMouseMove = (coords: { x: number; y: number }) => {
				if (!draggedNode) return;
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
	}, [containerRef, enabled, graph, onNoteOpen, onTagSelect, variant]);
}
