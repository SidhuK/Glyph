import { useCallback, useMemo, useState } from "react";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import type { WorkspaceDatabaseDocument } from "../../lib/tauri";
import type { ActiveCollection } from "./types";
import { useCollectionWorkspace } from "./useCollectionWorkspace";
import { useDatabaseDisplaySettings } from "./useDatabaseDisplaySettings";
import { useDatabaseRowActions } from "./useDatabaseRowActions";
import { useDatabaseRows } from "./useDatabaseRows";
import { useDatabaseViewActions } from "./useDatabaseViewActions";

const DATABASE_TABLE_ROW_PAGE_SIZE = 200;
const DATABASE_BOARD_ROW_PAGE_SIZE = 48;

export interface UseDatabasesPaneOptions {
	onOpenFile: (relPath: string) => Promise<void>;
	onRenameNotePath?: (
		notePath: string,
		nextName: string,
	) => Promise<string | null>;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeOpenRequest?: () => void;
	initialDocument?: WorkspaceDatabaseDocument | null;
}

export function useDatabasesPane({
	onRenameNotePath,
	databasesOpenRequest,
	onConsumeOpenRequest,
	initialDocument = null,
}: UseDatabasesPaneOptions) {
	const [error, setError] = useState("");
	const clearError = useCallback(() => setError(""), []);

	const workspace = useCollectionWorkspace({
		databasesOpenRequest,
		onConsumeOpenRequest,
		setError,
		clearError,
		initialDocument,
	});

	const display = useDatabaseDisplaySettings();

	const views = useDatabaseViewActions({
		document: workspace.document,
		selectedViewId: workspace.selectedViewId,
		saveDatabase: workspace.saveDatabase,
	});

	const rowPageSize =
		views.activeConfig?.view.layout === "board"
			? DATABASE_BOARD_ROW_PAGE_SIZE
			: DATABASE_TABLE_ROW_PAGE_SIZE;
	const rows = useDatabaseRows({
		selectedDatabaseId: workspace.selectedDatabaseId,
		selectedViewId: workspace.selectedViewId,
		document: workspace.document,
		pageSize: rowPageSize,
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
			loadSummaries: workspace.loadSummaries,
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
			commitDatabaseRename: workspace.commitDatabaseRename,
			handleDeleteDatabase: workspace.handleDeleteDatabase,
			collectionFolderBreadcrumb: workspace.collectionFolderBreadcrumb,
			selectCollection: workspace.selectCollection,
		},
		rows,
		display,
		views,
		viewSelection: {
			selectedViewId: workspace.selectedViewId,
			setSelectedViewId: workspace.setSelectedViewId,
		},
		activeCollection,
		actions: rowActions,
		ui: { error, setError, clearError },
	};
}

export type UseDatabasesPaneReturn = ReturnType<typeof useDatabasesPane>;
