import { useCallback, useMemo, useState } from "react";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import type { WorkspaceDatabaseDocument } from "../../lib/tauri";
import { useStatusPropertyColors } from "../useStatusPropertyColors";
import type { ActiveCollection } from "./types";
import { useCollectionWorkspace } from "./useCollectionWorkspace";
import { useDatabaseRowActions } from "./useDatabaseRowActions";
import { useDatabaseRows } from "./useDatabaseRows";
import { useDatabaseViewActions } from "./useDatabaseViewActions";

// Board lanes and table groups count the loaded rows, so both layouts page the same way and agree.
const DATABASE_ROW_PAGE_SIZE = 200;

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

	const rows = useDatabaseRows({
		selectedDatabaseId: workspace.selectedDatabaseId,
		selectedViewId: workspace.selectedViewId,
		document: workspace.document,
		pageSize: DATABASE_ROW_PAGE_SIZE,
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
