import { useCallback, useMemo, useState } from "react";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import type { WorkspaceDatabaseDocument } from "../../lib/tauri";
import { useStatusPropertyColors } from "../useStatusPropertyColors";
import type { ActiveCollection } from "./types";
import { useCalendarWindow } from "./useCalendarWindow";
import { useCollectionWorkspace } from "./useCollectionWorkspace";
import { useDatabaseRowActions } from "./useDatabaseRowActions";
import { useDatabaseRows } from "./useDatabaseRows";
import { useDatabaseViewActions } from "./useDatabaseViewActions";

const DATABASE_TABLE_ROW_PAGE_SIZE = 200;
const DATABASE_BOARD_ROW_PAGE_SIZE = 48;
// The backend caps a page at 500; a six-week window rarely holds more.
const DATABASE_CALENDAR_ROW_PAGE_SIZE = 500;

interface UseDatabasesPaneOptions {
	onRenameNotePath?: (notePath: string, nextName: string) => Promise<string | null>;
	databasesOpenRequest: DatabasesOpenRequest;
	initialDocument?: WorkspaceDatabaseDocument | null;
}

export function useDatabasesPane({
	onRenameNotePath,
	databasesOpenRequest,
	initialDocument = null,
}: UseDatabasesPaneOptions) {
	const [error, setError] = useState("");
	const clearError = useCallback(() => setError(""), []);

	const workspace = useCollectionWorkspace({
		databasesOpenRequest,
		setError,
		clearError,
		initialDocument,
	});

	const { colors: statusColors, setStatusColor } = useStatusPropertyColors();

	const views = useDatabaseViewActions({
		document: workspace.document,
		selectedViewId: workspace.selectedViewId,
		saveDatabase: workspace.saveDatabase,
	});

	const calendar = useCalendarWindow();
	const layout = views.activeConfig?.view.layout;
	const isCalendar = layout === "calendar";
	const rowPageSize = isCalendar
		? DATABASE_CALENDAR_ROW_PAGE_SIZE
		: layout === "board"
			? DATABASE_BOARD_ROW_PAGE_SIZE
			: DATABASE_TABLE_ROW_PAGE_SIZE;
	const rows = useDatabaseRows({
		selectedDatabaseId: workspace.selectedDatabaseId,
		selectedViewId: workspace.selectedViewId,
		document: workspace.document,
		pageSize: rowPageSize,
		dateRange: isCalendar ? calendar.dateRange : undefined,
		enabled: !isCalendar || Boolean(views.activeConfig?.view.calendar_date_column),
		setError,
		clearError,
	});

	const activeCollection = useMemo((): ActiveCollection | null => {
		const doc = workspace.document;
		const config = views.activeConfig;
		const view = views.activeView;
		if (!doc || !config || !view) return null;
		return { document: doc, config, view };
	}, [workspace.document, views.activeConfig, views.activeView]);

	const rowActions = useDatabaseRowActions({
		document: workspace.document,
		selectedViewId: workspace.selectedViewId,
		activeColumns: activeCollection?.config.columns ?? [],
		onRenameNotePath,
		setRows: rows.setRows,
		setSelectedRowPath: rows.setSelectedRowPath,
		setError,
		clearError,
	});

	return {
		selection: {
			summaries: workspace.summaries,
			selectedDatabaseId: workspace.selectedDatabaseId,
			setSelectedDatabaseId: workspace.setSelectedDatabaseId,
			createCollectionOpen: workspace.createCollectionOpen,
			setCreateCollectionOpen: workspace.setCreateCollectionOpen,
			openCreateCollectionDialog: workspace.openCreateCollectionDialog,
		},
		document: {
			document: workspace.document,
			loading: workspace.loading,
			nameDraft: workspace.nameDraft,
			setNameDraft: workspace.setNameDraft,
			saveDatabase: workspace.saveDatabase,
			setDatabasePinned: workspace.setDatabasePinned,
			commitDatabaseRename: workspace.commitDatabaseRename,
			handleDeleteDatabase: workspace.handleDeleteDatabase,
			collectionFolderBreadcrumb: workspace.collectionFolderBreadcrumb,
			selectCollection: workspace.selectCollection,
		},
		rows,
		calendar,
		display: { statusColors, setStatusColor },
		views,
		viewSelection: {
			selectedViewId: workspace.selectedViewId,
			setSelectedViewId: workspace.setSelectedViewId,
		},
		activeCollection,
		actions: rowActions,
		ui: { error: error || workspace.loadError, setError, clearError },
	};
}

export type UseDatabasesPaneReturn = ReturnType<typeof useDatabasesPane>;
