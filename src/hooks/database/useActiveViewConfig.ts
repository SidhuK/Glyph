import { useMemo } from "react";
import {
	getBoardGroupColumns,
	getDatabaseGroupColumns,
} from "../../lib/database/board";
import { resolveDatabaseColumns } from "../../lib/database/columns";
import { viewToConfig } from "../../lib/database/viewConfig";
import type {
	DatabaseColumn,
	DatabaseConfig,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";
import type { DatabaseView } from "./types";

export interface ActiveViewConfig {
	activeConfig: DatabaseConfig | null;
	activeView: DatabaseView | null;
	groupColumns: DatabaseColumn[];
	activeGroupColumn: DatabaseColumn | null;
	visibleColumns: DatabaseColumn[];
	resolvedColumns: DatabaseColumn[];
}

export interface UseActiveViewConfigOptions {
	document: WorkspaceDatabaseDocument | null;
	selectedViewId: string | null;
}

export function deriveActiveViewConfig(
	document: WorkspaceDatabaseDocument | null,
	selectedViewId: string | null,
): ActiveViewConfig {
	const activeConfig =
		document && selectedViewId
			? viewToConfig(document.database, selectedViewId)
			: null;

	const activeView =
		document?.database.views.find((view) => view.id === selectedViewId) ?? null;
	const resolvedColumns = activeConfig
		? resolveDatabaseColumns(
				activeConfig.columns,
				document?.available_properties ?? [],
			)
		: [];

	const groupColumns =
		activeConfig?.view.layout === "board"
			? getBoardGroupColumns(resolvedColumns)
			: getDatabaseGroupColumns(resolvedColumns);

	const activeGroupColumn =
		groupColumns.find(
			(column) => column.id === activeConfig?.view.board_group_by,
		) ?? null;

	const visibleColumns =
		activeConfig?.columns.filter((column) => column.visible) ?? [];

	return {
		activeConfig,
		activeView,
		groupColumns,
		activeGroupColumn,
		visibleColumns,
		resolvedColumns,
	};
}

export function useActiveViewConfig({
	document,
	selectedViewId,
}: UseActiveViewConfigOptions): ActiveViewConfig {
	return useMemo(
		() => deriveActiveViewConfig(document, selectedViewId),
		[document, selectedViewId],
	);
}
