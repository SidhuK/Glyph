import type { NativeContextMenuItem } from "../nativeContextMenu";

export type ActionMenuIconKey =
	| "table"
	| "board"
	| "edit"
	| "trash"
	| "library"
	| "plus";

export type ActionMenuItem =
	| { type: "separator" }
	| { type: "label"; label: string; key?: string }
	| {
			type: "item";
			label: string;
			key?: string;
			onSelect: () => void;
			checked?: boolean;
			enabled?: boolean;
			destructive?: boolean;
			iconKey?: ActionMenuIconKey;
			itemClassName?: string;
	  };

export function toNativeContextMenuItems(
	items: ActionMenuItem[],
): NativeContextMenuItem[] {
	const nativeItems: NativeContextMenuItem[] = [];

	for (const item of items) {
		switch (item.type) {
			case "separator":
				nativeItems.push({ type: "separator" });
				break;
			case "label":
				break;
			case "item":
				nativeItems.push({
					label: item.label,
					checked: item.checked,
					enabled: item.enabled,
					action: item.onSelect,
				});
				break;
		}
	}

	return nativeItems;
}
