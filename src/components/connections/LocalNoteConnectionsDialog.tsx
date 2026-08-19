import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
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
	const { t } = useTranslation("shell");
	const containerRef = useRef<HTMLDivElement | null>(null);

	const connectionsQuery = useQuery({
		queryKey: ["note-local-connections", noteId, connectionsRefreshKey],
		enabled: open && Boolean(noteId),
		queryFn: () => invoke("note_local_connections", { note_id: noteId }),
	});
	const payload = connectionsQuery.data ?? null;
	const error = connectionsQuery.error
		? extractErrorMessage(connectionsQuery.error)
		: "";

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

	const graph = useMemo<ConnectionsGraph | null>(() => {
		if (!payload) return null;
		return buildLocalConnectionsGraph(payload);
	}, [payload]);

	useSigmaConnections({
		graph,
		containerRef,
		variant: "local",
		enabled: Boolean(open && graph && !error),
		display: {
			nodeSizeScale: 1,
			linkOpacity: 1,
			linkThicknessScale: 1,
		},
		labelZoomThreshold: 0,
		onNoteOpen: openNode,
		onTagActivate: openTagSearch,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="localNoteConnectionsDialog"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">
					{t("connections.localTitle")}
				</DialogTitle>

				<div className="localNoteConnectionsBody">
					<DialogClose asChild>
						<button
							type="button"
							className="localNoteConnectionsClose"
							aria-label={t("connections.closeAria")}
						>
							×
						</button>
					</DialogClose>
					{error ? (
						<div className="localNoteConnectionsState">
							{t("connections.loadFailed", { error })}
						</div>
					) : (
						<div className="localNoteConnectionsStage">
							<div
								ref={containerRef}
								className="localNoteConnectionsViewport"
								aria-label={t("connections.localGraphAria")}
							/>
							<div
								className="localNoteConnectionsLegend"
								aria-label={t("connections.legendAria")}
							>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-current"
										aria-hidden="true"
									/>
									{t("connections.legendCurrent")}
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-note"
										aria-hidden="true"
									/>
									{t("connections.legendNote")}
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendNode is-tag"
										aria-hidden="true"
									/>
									{t("connections.legendTag")}
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendEdge is-link"
										aria-hidden="true"
									/>
									{t("connections.legendLink")}
								</span>
								<span className="localNoteConnectionsLegendItem">
									<span
										className="localNoteConnectionsLegendEdge is-tag-link"
										aria-hidden="true"
									/>
									{t("connections.legendTagShare")}
								</span>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
