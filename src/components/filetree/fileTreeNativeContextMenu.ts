import { i18n } from "../../i18n";
import type { NativeContextMenuItem } from "../../lib/nativeContextMenu";
import { buildPathCopyMenuItems } from "../../lib/pathClipboard";

interface FileTreeFileMenuOptions {
	path: string;
	spacePath: string | null;
	isMarkdown: boolean;
	isPinned: boolean;
	onOpen: () => void;
	onOpenInNewTab?: () => void;
	onOpenInNewWindow: () => void;
	onBrowseFolder?: () => void;
	onRevealInFinder: () => void;
	onRename?: () => void;
	onDuplicate: () => void;
	onTogglePinned: () => void;
	onOpenAppearancePicker: () => void;
	onNewFile: () => void;
	onCreateFromTemplate: () => void;
	onCreateFolder: () => void;
	onDelete: () => void;
}

export function fileTreeAppearanceNativeMenu(
	onOpenAppearancePicker: () => void,
): NativeContextMenuItem {
	return {
		label: i18n.t("shell:fileTree.iconAndColor"),
		action: onOpenAppearancePicker,
	};
}

export function buildFileTreeFileNativeMenu({
	path,
	spacePath,
	isMarkdown,
	isPinned,
	onOpen,
	onOpenInNewTab,
	onOpenInNewWindow,
	onBrowseFolder,
	onRevealInFinder,
	onRename,
	onDuplicate,
	onTogglePinned,
	onOpenAppearancePicker,
	onNewFile,
	onCreateFromTemplate,
	onCreateFolder,
	onDelete,
}: FileTreeFileMenuOptions): NativeContextMenuItem[] {
	return [
		{ label: i18n.t("shell:fileTree.open"), action: onOpen },
		...(isMarkdown && onOpenInNewTab
			? [{ label: i18n.t("shell:fileTree.openInNewTab"), action: onOpenInNewTab }]
			: []),
		...(isMarkdown
			? [{ label: i18n.t("shell:fileTree.openInNewWindow"), action: onOpenInNewWindow }]
			: []),
		...(onBrowseFolder
			? [{ label: i18n.t("shell:fileTree.showInFolder"), action: onBrowseFolder }]
			: []),
		{ label: i18n.t("shell:fileTree.showInFinder"), action: onRevealInFinder },
		...buildPathCopyMenuItems(spacePath, path, { includeDeeplink: isMarkdown }),
		{ type: "separator" },
		...(onRename ? [{ label: i18n.t("shell:fileTree.rename"), action: onRename }] : []),
		{ label: i18n.t("shell:fileTree.duplicateFile"), action: onDuplicate },
		{
			label: i18n.t(isPinned ? "shell:fileTree.unpinFile" : "shell:fileTree.pinFile"),
			action: onTogglePinned,
		},
		fileTreeAppearanceNativeMenu(onOpenAppearancePicker),
		{ type: "separator" },
		{ label: i18n.t("shell:fileTree.addFile"), action: onNewFile },
		{ label: i18n.t("shell:fileTree.createFromTemplate"), action: onCreateFromTemplate },
		{ label: i18n.t("shell:fileTree.addFolder"), action: onCreateFolder },
		{ type: "separator" },
		{ label: i18n.t("shell:fileTree.deleteFile"), action: onDelete },
	];
}
