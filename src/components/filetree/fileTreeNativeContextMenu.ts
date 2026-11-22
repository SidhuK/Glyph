import { i18n } from "../../i18n";
import type { NativeContextMenuItem } from "../../lib/nativeContextMenu";
import { buildPathCopyMenuItems } from "../../lib/pathClipboard";
import { statusColorKey, statusOptionsWithCustomValues } from "../../lib/statusProperties";

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
	status?: string | null;
	onSetStatus?: (status: string) => void;
	onNewFile: () => void;
	onCreateFromTemplate: () => void;
	onCreateFolder: () => void;
	onDelete: () => void;
	onArchive?: () => void;
}

export function fileTreeAppearanceNativeMenu(
	onOpenAppearancePicker: () => void,
): NativeContextMenuItem {
	return {
		label: i18n.t("shell:fileTree.iconAndColor"),
		action: onOpenAppearancePicker,
	};
}

function statusNativeMenu(
	status: string | null,
	onSetStatus: (status: string) => void,
): NativeContextMenuItem {
	const currentKey = statusColorKey(status);
	return {
		type: "submenu",
		label: i18n.t("shell:fileTree.status"),
		items: statusOptionsWithCustomValues([status]).map((option) => ({
			type: "check",
			label: option.custom ? option.label : i18n.t(`shell:collections.status.${option.id}`),
			checked: statusColorKey(option.label) === currentKey,
			action: () => onSetStatus(option.label),
		})),
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
	status = null,
	onSetStatus,
	onNewFile,
	onCreateFromTemplate,
	onCreateFolder,
	onDelete,
	onArchive,
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
		...(isMarkdown && onSetStatus ? [statusNativeMenu(status, onSetStatus)] : []),
		{ type: "separator" },
		{ label: i18n.t("shell:fileTree.addFile"), action: onNewFile },
		{ label: i18n.t("shell:fileTree.createFromTemplate"), action: onCreateFromTemplate },
		{ label: i18n.t("shell:fileTree.addFolder"), action: onCreateFolder },
		{ type: "separator" },
		...(isMarkdown && onArchive
			? [{ label: i18n.t("shell:noteCollections.archive"), action: onArchive }]
			: []),
		{ label: i18n.t("shell:fileTree.deleteFile"), action: onDelete },
	];
}
