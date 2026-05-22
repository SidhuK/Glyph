import { DATABASE_COLUMN_ICON_OPTIONS } from "../../lib/database/columnIcons";
import type { NativeContextMenuItem } from "../../lib/nativeContextMenu";
import type { FileTreeAppearance } from "../../lib/tauri";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "../editor/textColors";

function currentColor(
	appearance?: FileTreeAppearance | null,
): EditorTextColor | null {
	return appearance?.color && isEditorTextColor(appearance.color)
		? appearance.color
		: null;
}

export function fileTreeAppearanceNativeMenu(
	onOpenAppearancePicker: () => void,
): NativeContextMenuItem;
export function fileTreeAppearanceNativeMenu(
	itemKind: "dir" | "file",
	appearance: FileTreeAppearance | null | undefined,
	onChangeAppearance: (appearance: FileTreeAppearance) => void,
): NativeContextMenuItem;
export function fileTreeAppearanceNativeMenu(
	first: (() => void) | "dir" | "file",
	appearance?: FileTreeAppearance | null,
	onChangeAppearance?: (appearance: FileTreeAppearance) => void,
): NativeContextMenuItem {
	if (typeof first === "function") {
		return {
			label: "Icon & Color...",
			action: first,
		};
	}

	const selectedColor = currentColor(appearance);
	const selectedIcon = appearance?.icon ?? null;

	return {
		type: "submenu",
		label: "Icon & Color",
		items: [
			{
				type: "submenu",
				label: "Color",
				items: [
					...EDITOR_TEXT_COLORS.map((color) => ({
						label: color.label,
						checked: selectedColor === color.id,
						action: () =>
							onChangeAppearance?.({
								color: color.id,
								icon: selectedIcon,
							}),
					})),
					{ type: "separator" },
					{
						label: "Default Color",
						checked: selectedColor === null,
						action: () =>
							onChangeAppearance?.({
								color: null,
								icon: selectedIcon,
							}),
					},
				],
			},
			{
				type: "submenu",
				label: "Icon",
				items: [
					{
						label: first === "dir" ? "Default Folder" : "Default File",
						checked: selectedIcon === null,
						action: () =>
							onChangeAppearance?.({
								color: selectedColor,
								icon: null,
							}),
					},
					...DATABASE_COLUMN_ICON_OPTIONS.map((option) => ({
						label: option.label,
						checked: selectedIcon === option.id,
						action: () =>
							onChangeAppearance?.({
								color: selectedColor,
								icon: option.id,
							}),
					})),
				],
			},
		],
	};
}
