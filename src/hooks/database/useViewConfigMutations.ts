import { useCallback, useMemo, useState } from "react";
import {
	applyConfigToView,
	patchBoardMapField,
	patchViewState,
	removeBoardLaneColor,
} from "../../lib/database/viewConfig";
import type {
	DatabaseColumn,
	DatabaseConfig,
	WorkspaceDatabaseDefinition,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";
import type { DatabaseBoardHandlers } from "./types";

const MIN_DATABASE_COLUMN_WIDTH = 120;
const MAX_DATABASE_COLUMN_WIDTH = 900;

export interface UseViewConfigMutationsOptions {
	document: WorkspaceDatabaseDocument | null;
	selectedViewId: string | null;
	activeConfig: DatabaseConfig | null;
	saveDatabase: (
		nextDatabase: WorkspaceDatabaseDefinition,
	) => Promise<WorkspaceDatabaseDocument>;
}

export function useViewConfigMutations({
	document,
	selectedViewId,
	activeConfig,
	saveDatabase,
}: UseViewConfigMutationsOptions) {
	const [viewOptionsOpen, setViewOptionsOpen] = useState(false);

	const handleSaveConfig = useCallback(
		async (nextConfig: DatabaseConfig) => {
			if (!document || !selectedViewId) return;
			await saveDatabase(
				applyConfigToView(document.database, selectedViewId, nextConfig),
			);
		},
		[document, saveDatabase, selectedViewId],
	);

	const patchActiveView = useCallback(
		(viewPatch: Partial<DatabaseConfig["view"]>) => {
			if (!activeConfig) return;
			void handleSaveConfig(patchViewState(activeConfig, viewPatch));
		},
		[activeConfig, handleSaveConfig],
	);

	const patchActiveConfig = useCallback(
		(buildNext: (config: DatabaseConfig) => DatabaseConfig) => {
			if (!activeConfig) return;
			void handleSaveConfig(buildNext(activeConfig));
		},
		[activeConfig, handleSaveConfig],
	);

	const handleLaneOrderChange = useCallback(
		(groupColumnId: string, laneOrder: string[]) => {
			patchActiveConfig((config) =>
				patchBoardMapField(
					config,
					"board_lane_order",
					groupColumnId,
					laneOrder,
				),
			);
		},
		[patchActiveConfig],
	);

	const handleCardOrderChange = useCallback(
		(groupColumnId: string, cardOrder: Record<string, string[]>) => {
			patchActiveConfig((config) =>
				patchBoardMapField(
					config,
					"board_card_order",
					groupColumnId,
					cardOrder,
				),
			);
		},
		[patchActiveConfig],
	);

	const handleLaneColorChange = useCallback(
		(laneId: string, color: string | null) => {
			if (color) {
				patchActiveConfig((config) =>
					patchBoardMapField(config, "board_lane_colors", laneId, color),
				);
				return;
			}
			patchActiveConfig((config) => removeBoardLaneColor(config, laneId));
		},
		[patchActiveConfig],
	);

	const boardHandlers = useMemo((): DatabaseBoardHandlers | null => {
		if (!activeConfig) return null;
		return {
			onLaneOrderChange: handleLaneOrderChange,
			onCardOrderChange: handleCardOrderChange,
			onLaneColorChange: handleLaneColorChange,
		};
	}, [
		activeConfig,
		handleCardOrderChange,
		handleLaneColorChange,
		handleLaneOrderChange,
	]);

	const handleResizeColumn = useCallback(
		(columnId: string, width: number) => {
			if (!activeConfig) return;
			const nextWidth = Math.min(
				MAX_DATABASE_COLUMN_WIDTH,
				Math.max(MIN_DATABASE_COLUMN_WIDTH, Math.round(width)),
			);
			const currentWidth =
				activeConfig.columns.find((column) => column.id === columnId)?.width ??
				null;
			if (currentWidth != null && Math.round(currentWidth) === nextWidth) {
				return;
			}
			void handleSaveConfig({
				...activeConfig,
				columns: activeConfig.columns.map((column) =>
					column.id === columnId ? { ...column, width: nextWidth } : column,
				),
			});
		},
		[activeConfig, handleSaveConfig],
	);

	const handleChangeColumnIcon = useCallback(
		(columnId: string, iconName: string | null) => {
			if (!activeConfig) return;
			const nextIcon = iconName?.trim() || null;
			const currentIcon =
				activeConfig.columns.find((column) => column.id === columnId)?.icon ??
				null;
			if (currentIcon === nextIcon) return;
			void handleSaveConfig({
				...activeConfig,
				columns: activeConfig.columns.map((column) =>
					column.id === columnId ? { ...column, icon: nextIcon } : column,
				),
			});
		},
		[activeConfig, handleSaveConfig],
	);

	const handleToggleSort = useCallback(
		(column: DatabaseColumn) => {
			if (!activeConfig) return;
			void handleSaveConfig({
				...activeConfig,
				sorts:
					activeConfig.sorts[0]?.column_id === column.id
						? activeConfig.sorts[0]?.direction === "asc"
							? [{ column_id: column.id, direction: "desc" }]
							: []
						: [{ column_id: column.id, direction: "asc" }],
			});
		},
		[activeConfig, handleSaveConfig],
	);

	return {
		viewOptionsOpen,
		setViewOptionsOpen,
		handleSaveConfig,
		patchActiveView,
		boardHandlers,
		handleResizeColumn,
		handleChangeColumnIcon,
		handleToggleSort,
	};
}
