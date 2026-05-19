import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";

type TauriMenuItem = NonNullable<MenuOptions["items"]>[number];

interface NativeContextMenuBaseItem {
	label: string;
	enabled?: boolean;
}

interface NativeContextMenuActionItem extends NativeContextMenuBaseItem {
	type?: "item";
	checked?: boolean;
	action: () => void;
}

interface NativeContextMenuSubmenuItem extends NativeContextMenuBaseItem {
	type: "submenu";
	items: NativeContextMenuItem[];
}

interface NativeContextMenuSeparatorItem {
	type: "separator";
}

export type NativeContextMenuItem =
	| NativeContextMenuActionItem
	| NativeContextMenuSubmenuItem
	| NativeContextMenuSeparatorItem;

interface NativeContextMenuEvent {
	clientX: number;
	clientY: number;
	preventDefault: () => void;
	stopPropagation: () => void;
}

interface NativePopupMenuEvent extends NativeContextMenuEvent {
	currentTarget: Element;
}

interface NativeMenuResult {
	shown: boolean;
	didSelectItem: boolean;
}

function nativeMenuText(label: string): string {
	return label.replace(/&/g, "&&");
}

function buildTauriMenuItems(
	items: NativeContextMenuItem[],
	onAction: () => void,
): TauriMenuItem[] {
	return items.map((item): TauriMenuItem => {
		if (item.type === "separator") {
			return { item: "Separator" };
		}

		if (item.type === "submenu") {
			return {
				text: nativeMenuText(item.label),
				enabled: item.enabled ?? item.items.length > 0,
				items: buildTauriMenuItems(item.items, onAction),
			};
		}

		const action = () => {
			onAction();
			item.action();
		};

		if (item.checked !== undefined) {
			return {
				text: nativeMenuText(item.label),
				enabled: item.enabled ?? true,
				checked: item.checked,
				action,
			};
		}

		return {
			text: nativeMenuText(item.label),
			enabled: item.enabled ?? true,
			action,
		};
	});
}

export function isNativeContextMenuAvailable(): boolean {
	return isTauri();
}

async function showNativeMenu(
	event: NativeContextMenuEvent,
	items: NativeContextMenuItem[],
): Promise<NativeMenuResult> {
	if (!isTauri()) return { shown: false, didSelectItem: false };

	event.preventDefault();
	event.stopPropagation();

	let didSelectItem = false;
	const menu = await Menu.new({
		items: buildTauriMenuItems(items, () => {
			didSelectItem = true;
		}),
	});

	try {
		await menu.popup(new LogicalPosition(event.clientX, event.clientY));
		return { shown: true, didSelectItem };
	} finally {
		await menu.close().catch((error: unknown) => {
			console.error("Failed to close native context menu", error);
		});
	}
}

export async function showNativeContextMenu(
	event: NativeContextMenuEvent,
	items: NativeContextMenuItem[],
): Promise<boolean> {
	const result = await showNativeMenu(event, items);
	return result.didSelectItem;
}

export async function showNativePopupMenu(
	event: NativePopupMenuEvent,
	items: NativeContextMenuItem[],
): Promise<boolean> {
	const rect = event.currentTarget.getBoundingClientRect();
	const result = await showNativeMenu(
		{
			clientX: rect.left,
			clientY: rect.bottom,
			preventDefault: () => event.preventDefault(),
			stopPropagation: () => event.stopPropagation(),
		},
		items,
	);
	return result.didSelectItem;
}
