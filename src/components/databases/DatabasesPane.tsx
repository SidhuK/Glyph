import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useDatabasesPane } from "../../hooks/database/useDatabasesPane";
import { DATABASE_SEARCH_SOURCE_LIMIT } from "../../lib/database/collection";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import {
	EMPTY_BOARD_CARD_FIELDS,
	EMPTY_BOARD_CARD_ORDER,
	EMPTY_BOARD_LANE_ORDER,
} from "../../lib/database/viewConfig";
import type { WorkspaceDatabaseDocument } from "../../lib/tauri";
import { CanvasPaneAwait } from "../app/CanvasPaneAwait";
import { DatabaseBoard } from "../database/DatabaseBoard";
import { DatabaseTable } from "../database/DatabaseTable";
import { DatabaseToolbar } from "../database/DatabaseToolbar";
import { CollectionTitle } from "./CollectionTitle";
import { CollectionTopBar } from "./CollectionTopBar";
import { CollectionCreator } from "./CollectionCreator";
import { DatabaseViewTabs } from "./DatabaseViewTabs";

interface DatabasesPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	onRenameNotePath?: (notePath: string, nextName: string) => Promise<string | null>;
	databasesOpenRequest: DatabasesOpenRequest;
	initialDocument?: WorkspaceDatabaseDocument | null;
}

function DatabasesPaneContent({
	onOpenFile,
	onRenameNotePath,
	databasesOpenRequest,
	initialDocument = null,
}: DatabasesPaneProps) {
	const { t } = useTranslation("shell");
	const reduceMotion = useReducedMotion();
	const {
		selection,
		document: doc,
		rows,
		display,
		views,
		viewSelection,
		activeCollection,
		actions,
		ui,
	} = useDatabasesPane({
		onRenameNotePath,
		databasesOpenRequest,
		initialDocument,
	});

	const showCreator = !activeCollection || selection.collectionCreatorOpen;

	if (doc.loading) {
		return <CanvasPaneAwait variant="databases" />;
	}

	return (
		<div className="databaseHostPane">
			<CollectionTopBar document={doc} selection={selection} />

			{activeCollection && !showCreator ? (
				<>
					<CollectionTitle document={doc} />
					<div className="databasesViewBar">
						<div className="databasesViewBarPrimary">
							<DatabaseViewTabs
								document={activeCollection.document}
								selectedViewId={viewSelection.selectedViewId ?? activeCollection.view.id}
								setSelectedViewId={viewSelection.setSelectedViewId}
								saveDatabase={doc.saveDatabase}
								clearError={ui.clearError}
								activeView={activeCollection.view}
								patchActiveView={views.patchActiveView}
								reduceMotion={reduceMotion}
							/>
						</div>
						<DatabaseToolbar
							className="databaseToolbarInline"
							databaseView={activeCollection.config.view.layout}
							groupColumns={views.groupColumns}
							groupColumnId={activeCollection.config.view.board_group_by ?? null}
							config={activeCollection.config}
							availableProperties={activeCollection.document.available_properties}
							onGroupColumnIdChange={views.handleGroupColumnIdChange}
							onChangeConfig={views.handleSaveConfig}
							viewOptionsOpen={views.viewOptionsOpen}
							onViewOptionsOpenChange={views.setViewOptionsOpen}
							onCreateNote={() => void actions.handleCreateRow()}
						/>
					</div>
					{ui.error ? <div className="databaseNotice databaseNoticeError">{ui.error}</div> : null}
					{rows.sourceTruncated ? (
						<div className="databaseNotice">
							{t("collections.sourceTruncated", {
								limit: DATABASE_SEARCH_SOURCE_LIMIT.toLocaleString(),
							})}
						</div>
					) : null}
					{activeCollection.config.view.layout === "board" && views.boardHandlers ? (
						<DatabaseBoard
							rows={rows.rows}
							columns={views.resolvedColumns ?? activeCollection.config.columns}
							groupColumnId={activeCollection.config.view.board_group_by ?? null}
							laneOrderByGroup={
								activeCollection.config.view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER
							}
							cardOrderByGroup={
								activeCollection.config.view.board_card_order ?? EMPTY_BOARD_CARD_ORDER
							}
							laneColors={activeCollection.config.view.board_lane_colors ?? {}}
							statusColors={display.statusColors}
							selectedRowPath={rows.selectedRowPath}
							onSelectRow={rows.setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onCreateRow={actions.handleCreateRow}
							onOpenColumns={() => views.setViewOptionsOpen(true)}
							boardCardFields={
								activeCollection.config.view.board_card_fields ?? EMPTY_BOARD_CARD_FIELDS
							}
							activeSort={activeCollection.config.sorts[0] ?? null}
							onLaneOrderChange={views.boardHandlers.onLaneOrderChange}
							onCardOrderChange={views.boardHandlers.onCardOrderChange}
							onLaneColorChange={views.boardHandlers.onLaneColorChange}
							onStatusColorChange={display.setStatusColor}
							laneRenameTarget={{
								databaseId: activeCollection.document.database.id,
								viewId: activeCollection.view.id,
								revision: activeCollection.document.database.updated_at,
							}}
							membershipComplete={
								rows.allRowsLoaded &&
								activeCollection.view.filters.length === 0 &&
								!activeCollection.view.search?.trim()
							}
							hasMoreRows={rows.hasMoreRows}
							isLoadingMoreRows={rows.isLoadingMoreRows}
							onLoadMoreRows={rows.loadMoreRows}
							onSaveCell={actions.handleUpdateCell}
						/>
					) : (
						<DatabaseTable
							rows={rows.rows}
							columns={views.visibleColumns}
							laneColors={activeCollection.config.view.board_lane_colors ?? {}}
							statusColors={display.statusColors}
							onStatusColorChange={display.setStatusColor}
							selectedRowPath={rows.selectedRowPath}
							activeSort={activeCollection.config.sorts[0] ?? null}
							groupColumn={views.activeGroupColumn}
							cardOrderByGroup={
								views.activeGroupColumn
									? activeCollection.config.view.board_card_order?.[views.activeGroupColumn.id]
									: undefined
							}
							onCardOrderChange={views.persistCardOrder}
							onSelectRow={rows.setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onCreateRow={actions.handleCreateRow}
							onToggleSort={views.handleToggleSort}
							onChangeColumnIcon={views.handleChangeColumnIcon}
							onSaveCell={actions.handleUpdateCell}
							onRenameTitle={actions.handleRenameRowTitle}
							onResizeColumn={views.handleResizeColumn}
							hasMoreRows={rows.hasMoreRows}
							isLoadingMoreRows={rows.isLoadingMoreRows}
							onLoadMoreRows={rows.loadMoreRows}
						/>
					)}
				</>
			) : null}
			{showCreator ? (
				<div className="databasesEmptyState">
					{ui.error ? <div className="databaseNotice databaseNoticeError">{ui.error}</div> : null}
					<CollectionCreator
						summaries={selection.summaries}
						onCreated={(created) => void doc.selectCollection(created)}
						onError={ui.setError}
						onCancel={activeCollection ? () => selection.setCollectionCreatorOpen(false) : null}
					/>
				</div>
			) : null}
		</div>
	);
}

export function DatabasesPane(props: DatabasesPaneProps) {
	return <DatabasesPaneContent {...props} />;
}
