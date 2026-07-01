import type { NativeContextMenuItem } from "../../lib/nativeContextMenu";

export function fileTreeAppearanceNativeMenu(
	onOpenAppearancePicker: () => void,
): NativeContextMenuItem {
	return {
		label: "Icon & Color...",
		action: onOpenAppearancePicker,
	};
}
