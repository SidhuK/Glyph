import type { WorkspaceDatabaseDefinition } from "../tauri";

type DatabaseView = WorkspaceDatabaseDefinition["views"][number];

export function createDefaultDatabaseView(name: string, templateView: DatabaseView): DatabaseView {
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
		calendar_date_column: templateView.calendar_date_column ?? null,
		calendar_end_date_column: templateView.calendar_end_date_column ?? null,
		gallery_cover: templateView.gallery_cover ?? null,
		gallery_card_fields: [],
		gallery_card_size: templateView.gallery_card_size ?? "medium",
		created_at: now,
		updated_at: now,
	};
}
