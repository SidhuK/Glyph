import type { RefObject } from "react";
import type { Camera } from "sigma";
import { connectionsPairKey } from "./connectionsReducers";
import type { ConnectionsDisplayState, ConnectionsFocusState } from "./connectionsTheme";

export interface ConnectionsOverlayApi {
	setSearchMatches: (matchIds: ReadonlySet<string> | null) => void;
	setDisplay: (display: ConnectionsDisplayState) => void;
	setLabelZoomThreshold: (value: number) => void;
	setSelectedNode: (id: string | null) => void;
	setPath: (ids: readonly string[] | null) => void;
	setHiddenCommunities: (indexes: ReadonlySet<number>) => void;
	setShowUnlinked: (show: boolean) => void;
	zoomIn: () => void;
	zoomOut: () => void;
	fitView: () => void;
}

/** The mounted renderer's hooks; null while no renderer is mounted. */
export interface ConnectionsOverlaySession {
	readonly camera: Camera;
	readonly refresh: () => void;
	readonly applyLabelZoomThreshold: (value: number) => void;
}

const CAMERA_ANIMATION = { duration: 220 } as const;

export function initialConnectionsFocus(): ConnectionsFocusState {
	return {
		hoveredNode: null,
		hoverIds: null,
		selectedNodeId: null,
		searchMatchIds: null,
		pathIds: null,
		pathPairs: null,
		hiddenCommunities: new Set(),
		showUnlinked: false,
		dotLabels: false,
	};
}

/** Fit is camera ratio 1; zooming in lowers the ratio. */
export function connectionsZoomPercent(ratio: number) {
	return Math.round(100 / ratio);
}

export interface ConnectionsMountState {
	readonly searchMatchIds: ReadonlySet<string> | null;
	readonly selectedNodeId: string | null;
	readonly path: readonly string[] | null;
	readonly hiddenCommunities: ReadonlySet<number>;
	readonly showUnlinked: boolean;
}

export function seedConnectionsFocus(focus: ConnectionsFocusState, state: ConnectionsMountState) {
	focus.searchMatchIds = state.searchMatchIds ? new Set(state.searchMatchIds) : null;
	focus.selectedNodeId = state.selectedNodeId;
	focus.pathIds = state.path ? new Set(state.path) : null;
	focus.pathPairs = state.path ? pathPairs(state.path) : null;
	focus.hiddenCommunities = new Set(state.hiddenCommunities);
	focus.showUnlinked = state.showUnlinked;
}

function pathPairs(ids: readonly string[]) {
	const pairs = new Set<string>();
	for (let index = 1; index < ids.length; index += 1) {
		pairs.add(connectionsPairKey(ids[index - 1], ids[index]));
	}
	return pairs;
}

/**
 * View state lives in `focus` so it survives renderer remounts; each setter repaints the mounted
 * renderer, if any.
 */
export function createConnectionsOverlay(
	focus: ConnectionsFocusState,
	displayRef: RefObject<ConnectionsDisplayState>,
	labelZoomRef: RefObject<number>,
	sessionRef: RefObject<ConnectionsOverlaySession | null>,
): ConnectionsOverlayApi {
	const refresh = () => sessionRef.current?.refresh();
	return {
		setSearchMatches: (matchIds) => {
			focus.searchMatchIds = matchIds ? new Set(matchIds) : null;
			refresh();
		},
		setDisplay: (display) => {
			displayRef.current = display;
			refresh();
		},
		setLabelZoomThreshold: (value) => {
			labelZoomRef.current = value;
			sessionRef.current?.applyLabelZoomThreshold(value);
		},
		setSelectedNode: (id) => {
			focus.selectedNodeId = id;
			refresh();
		},
		setPath: (ids) => {
			focus.pathIds = ids ? new Set(ids) : null;
			focus.pathPairs = ids ? pathPairs(ids) : null;
			refresh();
		},
		setHiddenCommunities: (indexes) => {
			focus.hiddenCommunities = new Set(indexes);
			refresh();
		},
		setShowUnlinked: (show) => {
			focus.showUnlinked = show;
			refresh();
		},
		zoomIn: () => void sessionRef.current?.camera.animatedZoom(CAMERA_ANIMATION),
		zoomOut: () => void sessionRef.current?.camera.animatedUnzoom(CAMERA_ANIMATION),
		fitView: () => void sessionRef.current?.camera.animatedReset(CAMERA_ANIMATION),
	};
}
