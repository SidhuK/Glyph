import { type RefObject, useMemo, useRef, useState } from "react";
import type { ConnectionsGraphOptions } from "../../lib/connectionsGraphOptions";
import { dispatchTagClick, dispatchWikiLinkClick } from "../editor/markdown/editorEvents";
import type { ConnectionsPathEnd, ConnectionsViewContextValue } from "./ConnectionsViewContext";
import type { ConnectionsGraph } from "./connectionsGraph";
import type { ConnectionsHover } from "./connectionsInteractions";
import { findConnectionsPath } from "./connectionsPath";
import { connectionsSearchMatchIds } from "./connectionsSearch";
import { connectionsDisplayState } from "./useConnectionsSettings";
import { useSigmaConnections } from "./useSigmaConnections";

interface PathEnds {
	readonly from: string | null;
	readonly to: string | null;
}

const NO_PATH_ENDS: PathEnds = { from: null, to: null };

function openNote(id: string) {
	dispatchWikiLinkClick({
		raw: `[[${id}]]`,
		target: id,
		alias: null,
		anchorKind: "none",
		anchor: null,
		unresolved: false,
	});
}

function openTag(label: string) {
	dispatchTagClick({ tag: label, tagOnly: true });
}

function routeBetween(graph: ConnectionsGraph | null, { from, to }: PathEnds) {
	if (!graph || !from || !to) return null;
	return findConnectionsPath(graph, from, to);
}

interface UseConnectionsViewStateOptions {
	graph: ConnectionsGraph | null;
	containerRef: RefObject<HTMLDivElement | null>;
	enabled: boolean;
	options: ConnectionsGraphOptions;
	saveOptions: (options: ConnectionsGraphOptions) => void;
}

/** Owns the space graph's view state and mirrors every change into sigma from the handler that made it. */
export function useConnectionsViewState({
	graph,
	containerRef,
	enabled,
	options,
	saveOptions,
}: UseConnectionsViewStateOptions): ConnectionsViewContextValue {
	const [selectedState, setSelectedState] = useState<string | null>(null);
	const [pathMode, setPathModeState] = useState(false);
	const [pathEnds, setPathEnds] = useState<PathEnds>(NO_PATH_ENDS);
	const [hoverState, setHover] = useState<ConnectionsHover | null>(null);
	const [zoomPercent, setZoomPercent] = useState(100);
	const [searchQuery, setSearchQueryState] = useState("");
	const searchInputRef = useRef<HTMLInputElement | null>(null);

	const inGraph = (id: string | null) => (id && graph?.hasNode(id) ? id : null);
	const selectedId = inGraph(selectedState);
	const hover = hoverState && inGraph(hoverState.id) ? hoverState : null;
	const path = useMemo(() => routeBetween(graph, pathEnds), [graph, pathEnds]);
	const hasUnlinked = useMemo(
		() => Boolean(graph?.someNode((_id, attributes) => !attributes.linked)),
		[graph],
	);
	const display = useMemo(() => connectionsDisplayState(options), [options]);
	const searchMatchIds = useMemo(
		() => connectionsSearchMatchIds(graph, searchQuery),
		[graph, searchQuery],
	);

	const overlay = useSigmaConnections({
		graph,
		containerRef,
		variant: "space",
		enabled,
		display,
		labelZoomThreshold: options.labelZoomThreshold,
		searchMatchIds,
		selectedNodeId: selectedId,
		path,
		onNodeClick: (id, modifiers) => handleNodeClick(id, modifiers),
		onStageClick: () => selectNode(null),
		onNodeHover: setHover,
		onZoomChange: setZoomPercent,
	});

	function selectNode(id: string | null) {
		setSelectedState(id);
		overlay.current.setSelectedNode(id);
	}

	function applyPathEnds(next: PathEnds) {
		setPathEnds(next);
		overlay.current.setPath(routeBetween(graph, next));
	}

	function setPathEnd(id: string, end: ConnectionsPathEnd) {
		setPathModeState(true);
		if (end === "from") {
			applyPathEnds({ from: id, to: pathEnds.to === id ? null : pathEnds.to });
		} else if (id !== pathEnds.from) {
			applyPathEnds({ ...pathEnds, to: id });
		}
	}

	function startPath(id: string) {
		setPathModeState(true);
		applyPathEnds({ from: id, to: null });
	}

	function setPathMode(next: boolean) {
		setPathModeState(next);
		if (!next) applyPathEnds(NO_PATH_ENDS);
	}

	function openNode(id: string) {
		if (!graph?.hasNode(id)) return;
		if (graph.getNodeAttribute(id, "kind") === "tag") {
			openTag(graph.getNodeAttribute(id, "label"));
			return;
		}
		openNote(id);
	}

	function handleNodeClick(
		id: string,
		{ shiftKey, metaKey }: { shiftKey: boolean; metaKey: boolean },
	) {
		if (metaKey) {
			openNode(id);
			return;
		}
		if (pathMode) setPathEnd(id, shiftKey || !inGraph(pathEnds.from) ? "from" : "to");
		selectNode(id);
	}

	function setSearchQuery(query: string) {
		setSearchQueryState(query);
		overlay.current.setSearchMatches(connectionsSearchMatchIds(graph, query));
	}

	function setOptions(next: ConnectionsGraphOptions) {
		saveOptions(next);
		overlay.current.setDisplay(connectionsDisplayState(next));
		overlay.current.setLabelZoomThreshold(next.labelZoomThreshold);
	}

	return {
		graph,
		selectedId,
		selectNode,
		pathMode,
		setPathMode,
		pathFromId: inGraph(pathEnds.from),
		pathToId: inGraph(pathEnds.to),
		path,
		setPathEnd,
		startPath,
		clearPath: () => applyPathEnds(NO_PATH_ENDS),
		hover,
		hasUnlinked,
		zoomPercent,
		overlay,
		openNode,
		searchQuery,
		setSearchQuery,
		searchInputRef,
		options,
		setOptions,
	};
}
