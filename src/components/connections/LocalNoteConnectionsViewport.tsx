import { useMemo, useRef } from "react";
import type { LocalNoteConnections } from "../../lib/tauri";
import { buildLocalConnectionsGraph } from "./connectionsGraph";
import { useSigmaConnections } from "./useSigmaConnections";

interface LocalNoteConnectionsViewportProps {
	payload: LocalNoteConnections | null;
	enabled: boolean;
	ariaLabel: string;
	onNoteOpen: (nodeId: string) => void;
	onTagActivate: (tagId: string, label: string) => void;
}

const LOCAL_DISPLAY = {
	nodeSizeScale: 1,
	linkOpacity: 1,
	linkThicknessScale: 1,
	edgeBundling: 1,
};

export function LocalNoteConnectionsViewport({
	payload,
	enabled,
	ariaLabel,
	onNoteOpen,
	onTagActivate,
}: LocalNoteConnectionsViewportProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const graph = useMemo(() => (payload ? buildLocalConnectionsGraph(payload) : null), [payload]);

	useSigmaConnections({
		graph,
		containerRef,
		variant: "local",
		enabled: Boolean(enabled && graph),
		display: LOCAL_DISPLAY,
		labelZoomThreshold: 0,
		onNoteOpen,
		onTagActivate,
	});

	return <div ref={containerRef} className="localNoteConnectionsViewport" aria-label={ariaLabel} />;
}
