import { LoaderCircle, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpace } from "../../contexts";
import type { SpaceConnections } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { dispatchWikiLinkClick } from "../editor/markdown/editorEvents";
import { Button } from "../ui/shadcn/button";
import {
	buildSpaceConnectionsGraph,
	type ConnectionsGraph,
} from "./connectionsGraph";
import { useSigmaConnections } from "./useSigmaConnections";

function openNote(nodeId: string) {
	dispatchWikiLinkClick({
		raw: `[[${nodeId}]]`,
		target: nodeId,
		alias: null,
		anchorKind: "none",
		anchor: null,
		unresolved: false,
	});
}

export function SpaceConnectionsView() {
	const { spacePath } = useSpace();
	const [payload, setPayload] = useState<SpaceConnections | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const activeSpacePathRef = useRef(spacePath);
	activeSpacePathRef.current = spacePath;

	const loadConnections = useCallback(() => {
		const requestSpacePath = spacePath;
		let cancelled = false;
		setLoading(true);
		setError("");

		void invoke("space_connections")
			.then((nextGraph) => {
				if (cancelled || activeSpacePathRef.current !== requestSpacePath) return;
				setPayload(nextGraph);
			})
			.catch((cause) => {
				if (cancelled || activeSpacePathRef.current !== requestSpacePath) return;
				setPayload(null);
				setError(cause instanceof Error ? cause.message : String(cause));
			})
			.finally(() => {
				if (!cancelled && activeSpacePathRef.current === requestSpacePath) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [spacePath]);

	useEffect(() => loadConnections(), [loadConnections]);

	const graph = useMemo<ConnectionsGraph | null>(() => {
		if (!payload || payload.nodes.length === 0) return null;
		return buildSpaceConnectionsGraph(payload);
	}, [payload]);

	useSigmaConnections({
		graph,
		containerRef,
		variant: "space",
		enabled: Boolean(graph && !loading && !error),
		onNoteOpen: openNote,
	});

	if (loading) {
		return (
			<section className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden">
				<div
					className="localNoteConnectionsViewport absolute inset-0"
					aria-hidden="true"
				/>
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<HugeiconsIcon
							icon={LoaderCircle}
							className="animate-spin"
							size="var(--icon-sm)"
							strokeWidth={0.9}
						/>
						Loading notes and links…
					</div>
				</div>
			</section>
		);
	}

	if (error) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
				<div className="flex max-w-md flex-col items-center gap-3 text-center">
					<p className="text-sm text-muted-foreground">
						Could not load connections: {error}
					</p>
					<Button type="button" size="sm" onClick={loadConnections}>
						<HugeiconsIcon
							icon={Refresh01Icon}
							data-icon="inline-start"
							size="var(--icon-md)"
							strokeWidth={0.9}
						/>
						Retry
					</Button>
				</div>
			</div>
		);
	}

	if (!payload || payload.nodes.length === 0) {
		return (
			<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
				<p className="text-sm text-muted-foreground">
					No notes in this space yet.
				</p>
			</div>
		);
	}

	return (
		<section className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden">
			<div
				ref={containerRef}
				className="localNoteConnectionsViewport absolute inset-0"
				aria-label="Space connections"
			/>
			<div
				className="localNoteConnectionsLegend is-space"
				aria-label="Connections legend"
			>
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-note"
						aria-hidden="true"
					/>
					Note
				</span>
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-tag"
						aria-hidden="true"
					/>
					Tag
				</span>
				<span className="localNoteConnectionsLegendItem">
					<span
						className="localNoteConnectionsLegendNode is-isolated"
						aria-hidden="true"
					/>
					No connections
				</span>
			</div>
		</section>
	);
}
