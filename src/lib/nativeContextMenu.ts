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
): Promise<void> {
	event.preventDefault();
	event.stopPropagation();

	const menu = await Menu.new({
		items: items.map((item): TauriMenuItem => {
			if (item.type === "separator") return { item: "Separator" };
			return {
				text: nativeMenuText(item.label),
				enabled: item.enabled ?? true,
				action: item.action,
			};
		}),
	});

	try {
		await menu.popup(new LogicalPosition(event.clientX, event.clientY));
	} finally {
		await menu.close().catch((error: unknown) => {
			console.error("Failed to close native context menu", error);
		});
	}
}
