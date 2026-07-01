import type { WorkspaceDatabaseDefinition } from "../tauri";

type DatabaseView = WorkspaceDatabaseDefinition["views"][number];

export function createDefaultDatabaseView(
	name: string,
	templateView: DatabaseView,
): DatabaseView {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		name,
		layout: templateView.layout,
		search: "",
		icon: null,
		color: null,
		columns: templateView.columns.map((column) => ({ ...column })),
		sorts: [],
		filters: [],
		grouping: templateView.grouping
			? { ...templateView.grouping }
			: { column_id: "tags", ascending: true },
		board_lane_colors: {},
		board_lane_order: {},
		board_card_order: {},
		board_card_fields: [],
		created_at: now,
		updated_at: now,
	};
}
