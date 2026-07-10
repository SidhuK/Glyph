import { i18n } from "../../i18n";
import type { NativeContextMenuItem } from "../../lib/nativeContextMenu";

export function fileTreeAppearanceNativeMenu(
	onOpenAppearancePicker: () => void,
): NativeContextMenuItem {
	return {
		label: i18n.t("shell:fileTree.iconAndColor"),
		action: onOpenAppearancePicker,
	};
}
