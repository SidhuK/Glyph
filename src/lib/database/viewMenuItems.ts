import type { DatabaseViewLayout, WorkspaceDatabaseSummary } from "../tauri";
import type { ActionMenuItem } from "./actionMenuItems";

const DATABASE_VIEW_LAYOUTS = [
	"table",
	"board",
	"calendar",
	"gallery",
] as const satisfies readonly DatabaseViewLayout[];

interface ViewMenuActions {
	onSelectLayout: (layout: DatabaseViewLayout) => void;
	layoutHeading: string;
	layoutLabels: Record<DatabaseViewLayout, string>;
	createLabel: string;
	onCreate: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function buildViewMenuItems(
	activeLayout: DatabaseViewLayout,
	viewCount: number,
	actions: ViewMenuActions,
): ActionMenuItem[] {
	return [
		{ type: "label", label: actions.layoutHeading },
		...DATABASE_VIEW_LAYOUTS.map((layout): ActionMenuItem => ({
			type: "item",
			key: `layout-${layout}`,
			label: actions.layoutLabels[layout],
			checked: activeLayout === layout,
			iconKey: layout,
			onSelect: () => actions.onSelectLayout(layout),
		})),
		{ type: "separator" },
		{
			type: "item",
			label: "Rename",
			iconKey: "edit",
			onSelect: actions.onRename,
		},
		{
			type: "item",
			label: actions.createLabel,
			iconKey: "plus",
			onSelect: actions.onCreate,
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
