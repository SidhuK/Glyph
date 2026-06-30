import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalNoteConnections } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import {
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../editor/markdown/editorEvents";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "../ui/shadcn/dialog";
import {
	type ConnectionsGraph,
	buildLocalConnectionsGraph,
} from "./connectionsGraph";
import { useSigmaConnections } from "./useSigmaConnections";

interface LocalNoteConnectionsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	noteId: string;
	connectionsRefreshKey?: number;
}

export function LocalNoteConnectionsDialog({
	open,
	onOpenChange,
	noteId,
	connectionsRefreshKey = 0,
}: LocalNoteConnectionsDialogProps) {
	const [payload, setPayload] = useState<LocalNoteConnections | null>(null);
	const [error, setError] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);

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
	const openTagSearch = useCallback(
		(_tagId: string, label: string) => {
			onOpenChange(false);
			dispatchTagClick({ tag: label, tagOnly: true });
		},
		[onOpenChange],
	);

	useEffect(() => {
		if (!open || !noteId) return;
		void connectionsRefreshKey;
		let cancelled = false;
		setPayload(null);
		setError("");

		void invoke("note_local_connections", { note_id: noteId })
			.then((nextGraph) => {
				if (cancelled) return;
				setPayload(nextGraph);
			})
			.catch((cause) => {
				if (cancelled) return;
				setPayload(null);
				setError(cause instanceof Error ? cause.message : String(cause));
			});

		return () => {
			cancelled = true;
		};
	}, [connectionsRefreshKey, noteId, open]);

	const graph = useMemo<ConnectionsGraph | null>(() => {
		if (!payload) return null;
		return buildLocalConnectionsGraph(payload);
	}, [payload]);

	useSigmaConnections({
		graph,
		containerRef,
		variant: "local",
		enabled: Boolean(open && graph && !error),
		onNoteOpen: openNode,
		onTagActivate: openTagSearch,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="localNoteConnectionsDialog"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Connected Notes</DialogTitle>

				<div className="localNoteConnectionsBody">
					<DialogClose asChild>
						<button
							type="button"
							className="localNoteConnectionsClose"
							aria-label="Close connections"
						>
							×
						</button>
					</DialogClose>
					{error ? (
						<div className="localNoteConnectionsState">
							Could not load connections: {error}
						</div>
					) : (
						<div className="localNoteConnectionsStage">
							<div
								ref={containerRef}
								className="localNoteConnectionsViewport"
								aria-label="Local connections"
							/>
							<div
								className="localNoteConnectionsLegend"
								aria-label="Connections legend"
							>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-current"
										aria-hidden="true"
									/>
									Selected note
								</span>
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
										className="localNoteConnectionsLegendEdge is-link"
										aria-hidden="true"
									/>
									Note link
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendEdge is-tag-link"
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
