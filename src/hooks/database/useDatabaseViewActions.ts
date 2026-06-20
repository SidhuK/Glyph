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
	} = useActiveViewConfig({ document, selectedViewId });

	const mutations = useViewConfigMutations({
		document,
		selectedViewId,
		activeConfig,
		saveDatabase,
	});

	return {
		activeConfig,
		activeView,
		groupColumns,
		activeGroupColumn,
		visibleColumns,
		...mutations,
	};
}
