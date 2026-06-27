import { LibraryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useReducedMotion } from "motion/react";
import { useDatabasesPane } from "../../hooks/database/useDatabasesPane";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import {
	EMPTY_BOARD_CARD_FIELDS,
	EMPTY_BOARD_CARD_ORDER,
	EMPTY_BOARD_LANE_ORDER,
} from "../../lib/database/viewConfig";
import type { WorkspaceDatabaseDocument } from "../../lib/tauri";
import { Plus } from "../Icons";
import { CanvasPaneAwait } from "../app/CanvasPaneAwait";
import { DatabaseBoard } from "../database/DatabaseBoard";
import { DatabaseTable } from "../database/DatabaseTable";
import { DatabaseToolbar } from "../database/DatabaseToolbar";
import { Button } from "../ui/shadcn/button";
import { CollectionTopBar } from "./CollectionTopBar";
import { CreateCollectionDialog } from "./CreateCollectionDialog";
import { DatabaseViewTabs } from "./DatabaseViewTabs";

interface DatabasesPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	onRenameNotePath?: (
		notePath: string,
		nextName: string,
	) => Promise<string | null>;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeOpenRequest?: () => void;
	initialDocument?: WorkspaceDatabaseDocument | null;
}

function DatabasesPaneContent({
	onOpenFile,
	onRenameNotePath,
	databasesOpenRequest,
	onConsumeOpenRequest,
	initialDocument = null,
}: DatabasesPaneProps) {
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
		onOpenFile,
		onRenameNotePath,
		databasesOpenRequest,
		onConsumeOpenRequest,
		initialDocument,
	});

	if (doc.loading) {
		return <CanvasPaneAwait variant="databases" />;
	}

	return (
		<div className="databaseHostPane">
			<CollectionTopBar
				document={doc}
				selection={selection}
				views={views}
				actions={actions}
			/>

			{activeCollection ? (
				<>
					<div className="databasesViewBar">
						<DatabaseViewTabs
							document={activeCollection.document}
							selectedViewId={
								viewSelection.selectedViewId ?? activeCollection.view.id
							}
							setSelectedViewId={viewSelection.setSelectedViewId}
							saveDatabase={doc.saveDatabase}
							clearError={ui.clearError}
							activeView={activeCollection.view}
							patchActiveView={views.patchActiveView}
							reduceMotion={reduceMotion}
						/>
						<DatabaseToolbar
							className="databaseToolbarInline"
							databaseView={activeCollection.config.view.layout}
							groupColumns={views.groupColumns}
							groupColumnId={
								activeCollection.config.view.board_group_by ?? null
							}
							config={activeCollection.config}
							availableProperties={
								activeCollection.document.available_properties
							}
							onGroupColumnIdChange={views.handleGroupColumnIdChange}
							onChangeConfig={views.handleSaveConfig}
							viewOptionsOpen={views.viewOptionsOpen}
							onViewOptionsOpenChange={views.setViewOptionsOpen}
						/>
					</div>
					{ui.error ? (
						<div className="databaseNotice databaseNoticeError">{ui.error}</div>
					) : null}
					{activeCollection.config.view.layout === "board" &&
					views.boardHandlers ? (
						<DatabaseBoard
							rows={rows.rows}
							columns={views.resolvedColumns ?? activeCollection.config.columns}
							groupColumnId={
								activeCollection.config.view.board_group_by ?? null
							}
							laneOrderByGroup={
								activeCollection.config.view.board_lane_order ??
								EMPTY_BOARD_LANE_ORDER
							}
							cardOrderByGroup={
								activeCollection.config.view.board_card_order ??
								EMPTY_BOARD_CARD_ORDER
							}
							laneColors={activeCollection.config.view.board_lane_colors ?? {}}
							statusColors={display.statusColors}
							showColumnColor={display.showDatabaseColumnColor}
							selectedRowPath={rows.selectedRowPath}
							onSelectRow={rows.setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onCreateRow={actions.handleCreateRow}
							onOpenColumns={() => views.setViewOptionsOpen(true)}
							boardCardFields={
								activeCollection.config.view.board_card_fields ??
								EMPTY_BOARD_CARD_FIELDS
							}
							onGroupColumnIdChange={views.handleGroupColumnIdChange}
							onLaneOrderChange={views.boardHandlers.onLaneOrderChange}
							onCardOrderChange={views.boardHandlers.onCardOrderChange}
							onLaneColorChange={views.boardHandlers.onLaneColorChange}
							onStatusColorChange={display.setStatusColor}
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
			) : (
				<div className="databasesEmptyState">
					{ui.error ? (
						<div className="databaseNotice databaseNoticeError">{ui.error}</div>
					) : null}
					<HugeiconsIcon
						icon={LibraryIcon}
						size="var(--icon-3xl)"
						strokeWidth={0.9}
					/>
					<div className="databasesEmptyTitle">
						{selection.summaries.length === 0
							? "Create your first collection"
							: "Select a collection"}
					</div>
					<div className="databasesEmptyText">
						{selection.summaries.length === 0
							? "Collections help you see notes from a folder as a table or Kanban board."
							: "Use Switch collection above to get started."}
					</div>
					{selection.summaries.length === 0 ? (
						<>
							<ol className="databasesOnboardingSteps">
								<li>
									<strong>Choose notes</strong> — pick a folder, tag, or search.
								</li>
								<li>
									<strong>Shape the view</strong> — show columns, filters, and
									sorting.
								</li>
								<li>
									<strong>Track work</strong> — switch to board view and group
									by status, tags, or another field.
								</li>
							</ol>
							<Button
								type="button"
								size="sm"
								className="createCollectionCta"
								onClick={selection.openCreateCollectionDialog}
							>
								<Plus size="var(--icon-sm)" />
								Create Collection
							</Button>
						</>
					) : null}
				</div>
			)}
			<CreateCollectionDialog
				open={selection.createCollectionOpen}
				onOpenChange={selection.setCreateCollectionOpen}
				summaries={selection.summaries}
				onCreated={(created) => void doc.selectCollection(created)}
				onError={ui.setError}
			/>
		</div>
	);
}

export function DatabasesPane(props: DatabasesPaneProps) {
	return <DatabasesPaneContent {...props} />;
}
