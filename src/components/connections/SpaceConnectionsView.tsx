import { type KeyboardEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { ConnectionsClusterChips } from "./ConnectionsClusterChips";
import { ConnectionsInspector } from "./ConnectionsInspector";
import { ConnectionsPathBar } from "./ConnectionsPathBar";
import {
	type ConnectionsViewContextValue,
	ConnectionsViewProvider,
} from "./ConnectionsViewContext";
import { ConnectionsZoomControls } from "./ConnectionsZoomControls";
import {
	ConnectionsEmptyState,
	ConnectionsErrorState,
	ConnectionsLoadingState,
	ConnectionsNoConnectedState,
} from "./SpaceConnectionsStates";
import { SpaceConnectionsToolbar } from "./SpaceConnectionsToolbar";
import { useConnectionsSettings } from "./useConnectionsSettings";
import { useConnectionsViewState } from "./useConnectionsViewState";
import { useSpaceConnectionsData } from "./useSpaceConnectionsData";

/** Escape peels back one layer at a time: search, then selection, then path mode. */
function dismissTopLayer(view: ConnectionsViewContextValue) {
	if (view.searchQuery) {
		view.setSearchQuery("");
		return true;
	}
	if (view.selectedId) {
		view.selectNode(null);
		return true;
	}
	if (view.pathMode) {
		view.setPathMode(false);
		return true;
	}
	return false;
}

export function SpaceConnectionsView() {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const scopedSpacePath = spacePath ?? "";
	const containerRef = useRef<HTMLDivElement | null>(null);
	const { options, settingsPending, saveOptions } = useConnectionsSettings(scopedSpacePath);
	const data = useSpaceConnectionsData(scopedSpacePath, options);
	const loading = data.dataLoading || data.layoutLoading;
	const view = useConnectionsViewState({
		graph: data.graph,
		containerRef,
		// Option changes after mount only repaint through the overlay API, so mount once settings load.
		enabled: Boolean(data.graph && !loading && !data.error && !settingsPending),
		options,
		saveOptions,
	});

	const handleHostKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.key === "Escape") {
			if (dismissTopLayer(view)) event.preventDefault();
			return;
		}
		if (event.altKey || event.shiftKey || !event.metaKey) return;
		if (event.key.toLowerCase() !== "f" && event.code !== "KeyF") return;
		event.preventDefault();
		view.searchInputRef.current?.focus();
		view.searchInputRef.current?.select();
	};

	if (!loading && data.error) {
		return <ConnectionsErrorState error={data.error} onRetry={data.retry} />;
	}
	if (!data.dataLoading && (!data.payload || data.payload.nodes.length === 0)) {
		return <ConnectionsEmptyState />;
	}
	const hasConnected = Boolean(data.filteredPayload && data.filteredPayload.nodes.length > 0);

	return (
		<ConnectionsViewProvider value={view}>
			<section
				className="spaceConnectionsHost relative h-full min-h-0 flex-1 overflow-hidden"
				onKeyDown={handleHostKeyDown}
			>
				<div
					ref={containerRef}
					className="localNoteConnectionsViewport absolute inset-0"
					aria-label={t("connections.graphAria")}
				/>
				{data.dataLoading ? null : <SpaceConnectionsToolbar />}
				{loading ? <ConnectionsLoadingState arranging={!data.dataLoading} /> : null}
				{!loading && !hasConnected ? <ConnectionsNoConnectedState /> : null}
				{!loading && hasConnected ? (
					<>
						<ConnectionsPathBar />
						<ConnectionsInspector />
						<ConnectionsClusterChips />
						<ConnectionsZoomControls />
					</>
				) : null}
			</section>
		</ConnectionsViewProvider>
	);
}
