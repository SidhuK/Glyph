import type { DatabaseConfig, WorkspaceDatabaseDefinition } from "../tauri";

export const EMPTY_BOARD_LANE_COLORS: Record<string, string> = {};
export const EMPTY_BOARD_LANE_ORDER: Record<string, string[]> = {};
export const EMPTY_BOARD_CARD_ORDER: Record<
	string,
	Record<string, string[]>
> = {};
export const EMPTY_BOARD_CARD_FIELDS: string[] = [];

export function viewToConfig(
	database: WorkspaceDatabaseDefinition,
	viewId: string,
): DatabaseConfig | null {
	const view = database.views.find((entry) => entry.id === viewId);
	if (!view) return null;
	return {
		source: database.source,
		new_note: database.new_note,
		view: {
			layout: view.layout,
			search: view.search ?? "",
			board_group_by: view.grouping?.column_id ?? null,
			board_grouping: view.grouping ? { ...view.grouping } : null,
			board_lane_colors: view.board_lane_colors ?? EMPTY_BOARD_LANE_COLORS,
			board_lane_order: view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER,
			board_card_order: view.board_card_order ?? EMPTY_BOARD_CARD_ORDER,
			board_card_fields: view.board_card_fields ?? EMPTY_BOARD_CARD_FIELDS,
		},
		columns: view.columns,
		sorts: view.sorts,
		filters: view.filters,
	};
}

export function applyConfigToView(
	database: WorkspaceDatabaseDefinition,
	viewId: string,
	config: DatabaseConfig,
): WorkspaceDatabaseDefinition {
	return {
		...database,
		source: config.source,
		new_note: config.new_note,
		views: database.views.map((view) => {
			if (view.id !== viewId) return view;
			const grouping = config.view.board_group_by
				? config.view.board_grouping?.column_id === config.view.board_group_by
					? { ...config.view.board_grouping }
					: view.grouping?.column_id === config.view.board_group_by
						? { ...view.grouping }
						: {
								column_id: config.view.board_group_by,
								ascending: true,
							}
				: null;
			return {
				...view,
				layout: config.view.layout,
				search: config.view.search ?? "",
				grouping,
				board_lane_colors:
					config.view.board_lane_colors ?? EMPTY_BOARD_LANE_COLORS,
				board_lane_order:
					config.view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER,
				board_card_order:
					config.view.board_card_order ?? EMPTY_BOARD_CARD_ORDER,
				board_card_fields:
					config.view.board_card_fields ?? EMPTY_BOARD_CARD_FIELDS,
				columns: config.columns,
				sorts: config.sorts,
				filters: config.filters,
			};
		}),
	};
}

export function patchViewState(
	config: DatabaseConfig,
	viewPatch: Partial<DatabaseConfig["view"]>,
): DatabaseConfig {
	return {
		...config,
		view: {
			...config.view,
			...viewPatch,
		},
	};
}

export function patchBoardMapField(
	config: DatabaseConfig,
	field: "board_lane_order",
	key: string,
	value: string[],
): DatabaseConfig;
export function patchBoardMapField(
	config: DatabaseConfig,
	field: "board_card_order",
	key: string,
	value: Record<string, string[]>,
): DatabaseConfig;
export function patchBoardMapField(
	config: DatabaseConfig,
	field: "board_lane_colors",
	key: string,
	value: string,
): DatabaseConfig;
export function patchBoardMapField(
	config: DatabaseConfig,
	field: "board_lane_order" | "board_card_order" | "board_lane_colors",
	key: string,
	value: string[] | Record<string, string[]> | string,
): DatabaseConfig {
	const currentMap = config.view[field] ?? {};
	return patchViewState(config, {
		[field]: {
			...currentMap,
			[key]: value,
		},
	});
}

export function removeBoardLaneColor(
	config: DatabaseConfig,
	laneId: string,
): DatabaseConfig {
	const laneColors = config.view.board_lane_colors ?? EMPTY_BOARD_LANE_COLORS;
	return patchViewState(config, {
		board_lane_colors: Object.fromEntries(
			Object.entries(laneColors).filter(
				([entryLaneId]) => entryLaneId !== laneId,
			),
		),
	});
}
