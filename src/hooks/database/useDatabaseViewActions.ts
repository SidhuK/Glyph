import { useCallback } from "react";
import type { WorkspaceDatabaseDocument } from "../../lib/tauri";
import type { SaveDatabase } from "./types";
import { useActiveViewConfig } from "./useActiveViewConfig";
import { useViewConfigMutations } from "./useViewConfigMutations";

export interface UseDatabaseViewActionsOptions {
	document: WorkspaceDatabaseDocument | null;
	selectedViewId: string | null;
	saveDatabase: SaveDatabase;
}

export function useDatabaseViewActions({
	document,
	selectedViewId,
	saveDatabase,
}: UseDatabaseViewActionsOptions) {
	const {
		activeConfig,
		activeView,
		groupColumns,
		activeGroupColumn,
		visibleColumns,
		resolvedColumns,
	} = useActiveViewConfig({ document, selectedViewId });

	const mutations = useViewConfigMutations({
		document,
		selectedViewId,
		activeConfig,
		saveDatabase,
	});

	const handleGroupColumnIdChange = useCallback(
		(groupColumnId: string | null) => {
			const groupColumn =
				groupColumnId != null
					? (groupColumns.find((column) => column.id === groupColumnId) ?? null)
					: null;
			mutations.handleGroupColumnIdChange(groupColumnId, groupColumn);
		},
		[groupColumns, mutations.handleGroupColumnIdChange],
	);

	return {
		activeConfig,
		activeView,
		groupColumns,
		activeGroupColumn,
		visibleColumns,
		resolvedColumns,
		...mutations,
		handleGroupColumnIdChange,
	};
}
