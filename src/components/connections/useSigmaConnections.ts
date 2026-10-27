import { type RefObject, useEffect, useRef, useState } from "react";
import Sigma from "sigma";
import { drawConnectionsNodeHover, drawConnectionsNodeLabel } from "./connectionsCanvas";
import { drawConnectionsCaptions } from "./connectionsCaptions";
import {
	connectionsDotLabelRatio,
	connectionsLabelGrid,
	sigmaSettingsForVariant,
} from "./connectionsDensity";
import type {
	ConnectionsGraph,
	ConnectionsGraphVariant,
	ConnectionsSigma,
} from "./connectionsGraph";
import {
	type ConnectionsMountState,
	type ConnectionsOverlayApi,
	type ConnectionsOverlaySession,
	connectionsZoomPercent,
	createConnectionsOverlay,
	initialConnectionsFocus,
	seedConnectionsFocus,
} from "./connectionsOverlay";
import {
	type ConnectionsPointerCallbacks,
	bindConnectionsPointer,
} from "./connectionsInteractions";
import { buildEdgeReducer, buildNodeReducer } from "./connectionsReducers";
import {
	type ConnectionsDisplayState,
	resolveConnectionsLabelSize,
	resolveConnectionsPalette,
} from "./connectionsTheme";

export type { ConnectionsOverlayApi } from "./connectionsOverlay";

interface UseSigmaConnectionsOptions extends ConnectionsPointerCallbacks {
	graph: ConnectionsGraph | null;
	containerRef: RefObject<HTMLDivElement | null>;
	variant: ConnectionsGraphVariant;
	enabled: boolean;
	display: ConnectionsDisplayState;
	labelZoomThreshold: number;
	/** View state applied whenever a renderer mounts; later changes go through the overlay API. */
	searchMatchIds?: ReadonlySet<string> | null;
	selectedNodeId?: string | null;
	path?: readonly string[] | null;
	hiddenCommunities?: ReadonlySet<number>;
	showUnlinked?: boolean;
}

/** Cluster captions sit this many pixels below the UI label size. */
const CAPTION_SIZE_OFFSET_PX = 1.5;
const NO_HIDDEN_COMMUNITIES: ReadonlySet<number> = new Set();

export function useSigmaConnections({
	graph,
	containerRef,
	variant,
	enabled,
	display,
	labelZoomThreshold,
	searchMatchIds = null,
	selectedNodeId = null,
	path = null,
	hiddenCommunities = NO_HIDDEN_COMMUNITIES,
	showUnlinked = false,
	...callbacks
}: UseSigmaConnectionsOptions): RefObject<ConnectionsOverlayApi> {
	const focusRef = useRef(initialConnectionsFocus());
	const displayRef = useRef(display);
	displayRef.current = display;
	const labelZoomRef = useRef(labelZoomThreshold);
	labelZoomRef.current = labelZoomThreshold;
	const mountState = { searchMatchIds, selectedNodeId, path, hiddenCommunities, showUnlinked };
	const mountStateRef = useRef<ConnectionsMountState>(mountState);
	mountStateRef.current = mountState;
	const callbacksRef = useRef(callbacks);
	callbacksRef.current = callbacks;
	const sessionRef = useRef<ConnectionsOverlaySession | null>(null);
	const [overlayRef] = useState(() => ({
		current: createConnectionsOverlay(focusRef.current, displayRef, labelZoomRef, sessionRef),
	}));

	useEffect(() => {
		if (!enabled || !graph || graph.order === 0) return;
		const container = containerRef.current;
		if (!container) return;

		const focus = focusRef.current;
		let disposed = false;
		let renderer: ConnectionsSigma | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let themeObserver: MutationObserver | null = null;
		let setupFrame = 0;
		let refreshFrame = 0;

		const setup = () => {
			if (disposed) return;
			if (container.clientWidth <= 0 || container.clientHeight <= 0) {
				setupFrame = window.requestAnimationFrame(setup);
				return;
			}

			let palette = resolveConnectionsPalette(container);
			let font = getComputedStyle(container).fontFamily;
			let dotRatio = connectionsDotLabelRatio(variant, labelZoomRef.current);
			seedConnectionsFocus(focus, mountStateRef.current);
			focus.dotLabels = dotRatio >= 1;
			const getPalette = () => palette;
			const getFocus = () => focus;
			const getDisplay = () => displayRef.current;

			const activeRenderer: ConnectionsSigma = new Sigma(graph, container, {
				...sigmaSettingsForVariant(variant, graph.size, graph.order, labelZoomRef.current),
				labelColor: { color: palette.textSecondary },
				labelFont: font,
				labelSize: resolveConnectionsLabelSize(container, variant),
				labelWeight: "400",
				defaultDrawNodeLabel: (context, data, settings) =>
					drawConnectionsNodeLabel(context, data, settings, palette),
				defaultDrawNodeHover: (context, data, settings) =>
					drawConnectionsNodeHover(context, data, settings, palette),
				nodeReducer: buildNodeReducer(graph, getPalette, getFocus, getDisplay),
				edgeReducer: buildEdgeReducer(graph, getPalette, getFocus, getDisplay),
			});
			renderer = activeRenderer;
			const camera = activeRenderer.getCamera();

			// Hover and overlay changes can land several times a frame; repaint once per frame.
			const scheduleRefresh = () => {
				if (refreshFrame) return;
				refreshFrame = window.requestAnimationFrame(() => {
					refreshFrame = 0;
					if (!disposed) activeRenderer.refresh();
				});
			};

			sessionRef.current = {
				camera,
				refresh: scheduleRefresh,
				applyLabelZoomThreshold: (value) => {
					dotRatio = connectionsDotLabelRatio(variant, value);
					focus.dotLabels = camera.ratio <= dotRatio;
					if (variant === "space") activeRenderer.setSettings(connectionsLabelGrid(value));
					scheduleRefresh();
				},
			};

			if (variant === "space") {
				const labelsContext = activeRenderer.getCanvases().labels.getContext("2d");
				activeRenderer.on("afterRender", () => {
					if (!labelsContext) return;
					const size = activeRenderer.getSetting("labelSize") - CAPTION_SIZE_OFFSET_PX;
					drawConnectionsCaptions(
						labelsContext,
						activeRenderer,
						graph,
						{ palette, font, size },
						focus,
					);
				});
			}

			let zoomPercent = connectionsZoomPercent(camera.ratio);
			callbacksRef.current.onZoomChange?.(zoomPercent);
			camera.on("updated", (state) => {
				const nextPercent = connectionsZoomPercent(state.ratio);
				if (nextPercent !== zoomPercent) {
					zoomPercent = nextPercent;
					callbacksRef.current.onZoomChange?.(nextPercent);
				}
				const dotLabels = state.ratio <= dotRatio;
				if (dotLabels === focus.dotLabels) return;
				focus.dotLabels = dotLabels;
				scheduleRefresh();
			});

			bindConnectionsPointer({
				renderer: activeRenderer,
				graph,
				variant,
				focus,
				refresh: scheduleRefresh,
				getCallbacks: () => callbacksRef.current,
			});

			resizeObserver = new ResizeObserver(() => {
				activeRenderer.resize();
				scheduleRefresh();
			});
			resizeObserver.observe(container);

			themeObserver = new MutationObserver(() => {
				palette = resolveConnectionsPalette(container);
				font = getComputedStyle(container).fontFamily;
				activeRenderer.setSettings({
					labelColor: { color: palette.textSecondary },
					labelFont: font,
					labelSize: resolveConnectionsLabelSize(container, variant),
				});
				scheduleRefresh();
			});
			themeObserver.observe(document.documentElement, {
				attributeFilter: ["class", "data-light-theme", "data-dark-theme", "style"],
				attributes: true,
			});
		};

		setup();

		return () => {
			disposed = true;
			if (setupFrame) window.cancelAnimationFrame(setupFrame);
			if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
			themeObserver?.disconnect();
			resizeObserver?.disconnect();
			renderer?.kill();
			sessionRef.current = null;
			focus.hoveredNode = null;
			focus.hoverIds = null;
		};
	}, [containerRef, enabled, graph, variant]);

	return overlayRef;
}
