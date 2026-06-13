import { useMemo } from "react";
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

	const groupColumns = (activeConfig?.columns ?? []).filter(
		(column) => column.type === "tags" || column.type === "property",
	);

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
