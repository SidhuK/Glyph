import type { TFunction } from "i18next";
import type { WorkspaceDatabaseSummary } from "../tauri";
import type { ActionMenuItem } from "./actionMenuItems";

type DatabaseViewLayout = "table" | "board";

interface ViewMenuActions {
	onSelectLayout: (layout: DatabaseViewLayout) => void;
	onCreate: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function buildViewMenuItems(
	t: TFunction<"shell">,
	activeLayout: DatabaseViewLayout,
	viewCount: number,
	actions: ViewMenuActions,
): ActionMenuItem[] {
	return [
		{ type: "label", label: t("collections.viewMenu.viewType") },
		{
			type: "item",
			label: t("collections.viewMenu.table"),
			checked: activeLayout === "table",
			iconKey: "table",
			onClick: () => actions.onSelectLayout("table"),
		},
		{
			type: "item",
			label: t("collections.viewMenu.board"),
			checked: activeLayout === "board",
			iconKey: "board",
			onClick: () => actions.onSelectLayout("board"),
		},
		{ type: "separator" },
		{
			type: "item",
			label: t("collections.viewMenu.rename"),
			iconKey: "edit",
			onClick: actions.onRename,
		},
		{
			type: "item",
			label: t("collections.addView"),
			iconKey: "plus",
			onClick: actions.onCreate,
		},
		{ type: "separator" },
		{
			type: "item",
			label: t("collections.viewMenu.deleteView"),
			enabled: viewCount > 1,
			destructive: true,
			iconKey: "trash",
			onClick: actions.onDelete,
		},
	];
}

export function buildCollectionMenuItems(
	t: TFunction<"shell">,
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
		onClick: () => setSelectedDatabaseId(summary.id),
	}));

	if (summaries.length > 0) {
		items.push({ type: "separator" });
	}

	items.push({
		type: "item",
		label: t("collections.newCollection"),
		key: "new-collection",
		iconKey: "plus",
		onClick: openCreateCollectionDialog,
	});

	return items;
}
