import type { NativeContextMenuItem } from "../../lib/nativeContextMenu";

export function fileTreeAppearanceNativeMenu(
	onOpenAppearancePicker: () => void,
	label = "Icon & Color...",
): NativeContextMenuItem {
	return {
		label,
		action: onOpenAppearancePicker,
	};
}
