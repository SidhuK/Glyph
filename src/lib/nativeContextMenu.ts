import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";

type TauriMenuItem = NonNullable<MenuOptions["items"]>[number];

export type NativeContextMenuItem =
	| { type?: "item"; label: string; enabled?: boolean; action: () => void }
	| { type: "check"; label: string; checked: boolean; action: () => void }
	| { type: "submenu"; label: string; items: NativeContextMenuItem[] }
	| { type: "separator" };

export interface NativeContextMenuEvent {
	clientX: number;
	clientY: number;
	preventDefault: () => void;
	stopPropagation: () => void;
}

function nativeMenuText(label: string): string {
	return label.replace(/&/g, "&&");
}

function toTauriMenuItem(item: NativeContextMenuItem): TauriMenuItem {
	switch (item.type) {
		case "separator":
			return { item: "Separator" };
		case "check":
			return { text: nativeMenuText(item.label), checked: item.checked, action: item.action };
		case "submenu":
			return { text: nativeMenuText(item.label), items: item.items.map(toTauriMenuItem) };
		default:
			return {
				text: nativeMenuText(item.label),
				enabled: item.enabled ?? true,
				action: item.action,
			};
	}
}

export async function showNativeContextMenu(
	event: NativeContextMenuEvent,
	items: NativeContextMenuItem[],
): Promise<void> {
	event.preventDefault();
	event.stopPropagation();

	const menu = await Menu.new({ items: items.map(toTauriMenuItem) });

	try {
		await menu.popup(new LogicalPosition(event.clientX, event.clientY));
	} finally {
		await menu.close().catch((error: unknown) => {
			console.error("Failed to close native context menu", error);
		});
	}
}
