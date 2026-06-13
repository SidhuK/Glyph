import { useCallback, useMemo, useState } from "react";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import type {
	WorkspaceDatabaseDocument,
	WorkspaceDatabaseQueryResult,
} from "../../lib/tauri";
import type { ActiveCollection } from "./types";
import { useCollectionWorkspace } from "./useCollectionWorkspace";
import { useDatabaseDisplaySettings } from "./useDatabaseDisplaySettings";
import { useDatabaseRowActions } from "./useDatabaseRowActions";
import { useDatabaseRows } from "./useDatabaseRows";
import { useDatabaseViewActions } from "./useDatabaseViewActions";

export interface UseDatabasesPaneOptions {
	onOpenFile: (relPath: string) => Promise<void>;
	onRenameNotePath?: (
		notePath: string,
		nextName: string,
	) => Promise<string | null>;
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeOpenRequest?: () => void;
	initialDocument?: WorkspaceDatabaseDocument | null;
	initialRows?: WorkspaceDatabaseQueryResult | null;
}

export function useDatabasesPane({
	onRenameNotePath,
	databasesOpenRequest,
	onConsumeOpenRequest,
	initialDocument = null,
	initialRows = null,
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

	const rows = useDatabaseRows({
		selectedDatabaseId: workspace.selectedDatabaseId,
		selectedViewId: workspace.selectedViewId,
		document: workspace.document,
		initialRows,
		setError,
		clearError,
	});

	const display = useDatabaseDisplaySettings();

	const views = useDatabaseViewActions({
		document: workspace.document,
		selectedViewId: workspace.selectedViewId,
		saveDatabase: workspace.saveDatabase,
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
