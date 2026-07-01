import { useCallback, useMemo, useState } from "react";
import {
	applyConfigToView,
	patchBoardMapField,
	patchViewState,
	removeBoardLaneColor,
	viewToConfig,
} from "../../lib/database/viewConfig";
import type {
	DatabaseColumn,
	DatabaseConfig,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";
import type { DatabaseBoardHandlers, SaveDatabase } from "./types";

const MIN_DATABASE_COLUMN_WIDTH = 120;
const MAX_DATABASE_COLUMN_WIDTH = 900;

export interface UseViewConfigMutationsOptions {
	document: WorkspaceDatabaseDocument | null;
	selectedViewId: string | null;
	activeConfig: DatabaseConfig | null;
	saveDatabase: SaveDatabase;
}

export function useViewConfigMutations({
	document,
	selectedViewId,
	activeConfig,
	saveDatabase,
}: UseViewConfigMutationsOptions) {
	const [viewOptionsOpen, setViewOptionsOpen] = useState(false);

	const handleSaveConfig = useCallback(
		async (
			nextConfig: DatabaseConfig | ((config: DatabaseConfig) => DatabaseConfig),
		) => {
			if (!document || !selectedViewId) return;
			await saveDatabase((currentDatabase) => {
				const currentConfig = viewToConfig(currentDatabase, selectedViewId);
				if (!currentConfig) return currentDatabase;
				const resolvedConfig =
					typeof nextConfig === "function"
						? nextConfig(currentConfig)
						: nextConfig;
				if (resolvedConfig === currentConfig) return currentDatabase;
				return applyConfigToView(
					currentDatabase,
					selectedViewId,
					resolvedConfig,
				);
			});
		},
		[document, saveDatabase, selectedViewId],
	);

	const patchActiveView = useCallback(
		(viewPatch: Partial<DatabaseConfig["view"]>) => {
			void handleSaveConfig((config) => patchViewState(config, viewPatch));
		},
		[handleSaveConfig],
	);

	const patchActiveConfig = useCallback(
		(buildNext: (config: DatabaseConfig) => DatabaseConfig) => {
			void handleSaveConfig(buildNext);
		},
		[handleSaveConfig],
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
			const nextWidth = Math.min(
				MAX_DATABASE_COLUMN_WIDTH,
				Math.max(MIN_DATABASE_COLUMN_WIDTH, Math.round(width)),
			);
			void handleSaveConfig((config) => {
				const currentWidth =
					config.columns.find((column) => column.id === columnId)?.width ??
					null;
				if (currentWidth != null && Math.round(currentWidth) === nextWidth) {
					return config;
				}
				return {
					...config,
					columns: config.columns.map((column) =>
						column.id === columnId ? { ...column, width: nextWidth } : column,
					),
				};
			});
		},
		[handleSaveConfig],
	);

	const handleChangeColumnIcon = useCallback(
		(columnId: string, iconName: string | null) => {
			const nextIcon = iconName?.trim() || null;
			void handleSaveConfig((config) => {
				const currentIcon =
					config.columns.find((column) => column.id === columnId)?.icon ?? null;
				if (currentIcon === nextIcon) return config;
				return {
					...config,
					columns: config.columns.map((column) =>
						column.id === columnId ? { ...column, icon: nextIcon } : column,
					),
				};
			});
		},
		[handleSaveConfig],
	);

	const handleToggleSort = useCallback(
		(column: DatabaseColumn) => {
			void handleSaveConfig((config) => {
				return {
					...config,
					sorts:
						config.sorts[0]?.column_id === column.id
							? config.sorts[0]?.direction === "asc"
								? [{ column_id: column.id, direction: "desc" }]
								: []
							: [{ column_id: column.id, direction: "asc" }],
				};
			});
		},
		[handleSaveConfig],
	);

	const handleGroupColumnIdChange = useCallback(
		(groupColumnId: string | null, groupColumn: DatabaseColumn | null) => {
			void handleSaveConfig((config) => {
				const nextColumns =
					groupColumnId && groupColumn
						? config.columns.some((column) => column.id === groupColumn.id)
							? config.columns
							: [...config.columns, { ...groupColumn, visible: false }]
						: config.columns;
				return patchViewState(
					{ ...config, columns: nextColumns },
					{ board_group_by: groupColumnId },
				);
			});
		},
		[handleSaveConfig],
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
		handleGroupColumnIdChange,
	};
}
