import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";

type TauriMenuItem = NonNullable<MenuOptions["items"]>[number];

export type NativeContextMenuItem =
	| { type?: "item"; label: string; enabled?: boolean; action: () => void }
	| { type: "separator" };

interface NativeContextMenuEvent {
	clientX: number;
	clientY: number;
	preventDefault: () => void;
	stopPropagation: () => void;
}

function nativeMenuText(label: string): string {
	return label.replace(/&/g, "&&");
}

export async function showNativeContextMenu(
	event: NativeContextMenuEvent,
	items: NativeContextMenuItem[],
): Promise<boolean> {
	if (!isTauri()) return false;

	event.preventDefault();
	event.stopPropagation();

	let didSelectItem = false;
	const menu = await Menu.new({
		items: items.map((item): TauriMenuItem => {
			if (item.type === "separator") return { item: "Separator" };
			return {
				text: nativeMenuText(item.label),
				enabled: item.enabled ?? true,
				action: () => {
					didSelectItem = true;
					item.action();
				},
			};
		}),
	});

	try {
		await menu.popup(new LogicalPosition(event.clientX, event.clientY));
		return didSelectItem;
	} finally {
		await menu.close().catch((error: unknown) => {
			console.error("Failed to close native context menu", error);
		});
	}
}
