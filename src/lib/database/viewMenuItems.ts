import type { WorkspaceDatabaseSummary } from "../tauri";
import type { ActionMenuItem } from "./actionMenuItems";

export type DatabaseViewLayout = "table" | "board";

export interface ViewMenuActions {
	onSelectLayout: (layout: DatabaseViewLayout) => void;
	onRename: () => void;
	onDelete: () => void;
}

export function buildViewMenuItems(
	activeLayout: DatabaseViewLayout,
	viewCount: number,
	actions: ViewMenuActions,
): ActionMenuItem[] {
	return [
		{ type: "label", label: "View type" },
		{
			type: "item",
			label: "Table",
			checked: activeLayout === "table",
			iconKey: "table",
			onSelect: () => actions.onSelectLayout("table"),
		},
		{
			type: "item",
			label: "Board",
			checked: activeLayout === "board",
			iconKey: "board",
			onSelect: () => actions.onSelectLayout("board"),
		},
		{ type: "separator" },
		{
			type: "item",
			label: "Rename",
			iconKey: "edit",
			onSelect: actions.onRename,
		},
		{ type: "separator" },
		{
			type: "item",
			label: "Delete view",
			enabled: viewCount > 1,
			destructive: true,
			iconKey: "trash",
			onSelect: actions.onDelete,
		},
	];
}

export function buildCollectionMenuItems(
	summaries: WorkspaceDatabaseSummary[],
	selectedDatabaseId: string | null,
	setSelectedDatabaseId: (id: string) => void,
	openCreateCollectionDialog: () => void,
): ActionMenuItem[] {
	const items: ActionMenuItem[] = summaries.map((summary) => ({
		type: "item",
		label: summary.name,
		key: `collection-${summary.id}`,
		checked: summary.id === selectedDatabaseId,
		iconKey: "library",
		onSelect: () => setSelectedDatabaseId(summary.id),
	}));

	if (summaries.length > 0) {
		items.push({ type: "separator" });
	}

	items.push({
		type: "item",
		label: "New collection",
		key: "new-collection",
		iconKey: "plus",
		onSelect: openCreateCollectionDialog,
	});

	return items;
}
