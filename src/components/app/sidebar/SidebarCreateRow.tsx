import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import type { PeriodKind } from "@/lib/periodNotes";
import { formatShortcutForPlatform } from "@/lib/shortcuts/platform";
import type { SidebarVisibilityKey } from "@/lib/settings/model";
import { PlusSignIcon as NewNoteIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { SidebarCreateMenu } from "./SidebarCreateMenu";
import type { SidebarGetBinding } from "./sidebarContentProps";

interface SidebarCreateRowProps {
	"data-sidebar-key": SidebarVisibilityKey;
	showNewNote: boolean;
	showCanvas: boolean;
	newNoteFolder: string;
	onNewNote: () => void;
	onNewCanvas: () => void;
	onOpenPeriodNote: (kind: PeriodKind) => void;
	onOpenQuickNote: () => void;
	onCreateFromTemplate: () => void;
	getBinding: SidebarGetBinding;
}

/** New note plus the chevron menu for canvases, templates and period notes. The rail keeps
 * only the New note icon. */
export function SidebarCreateRow({
	"data-sidebar-key": sidebarKey,
	showNewNote,
	showCanvas,
	newNoteFolder,
	onNewNote,
	onNewCanvas,
	onOpenPeriodNote,
	onOpenQuickNote,
	onCreateFromTemplate,
	getBinding,
}: SidebarCreateRowProps) {
	const { t } = useTranslation("shell");
	const newNoteShortcut = getBinding("new-note");
	const newNoteTitle = newNoteFolder
		? t("sidebar.newNoteInFolder", { folder: newNoteFolder })
		: t("sidebar.newNoteInRoot");

	return (
		<div className="sidebarCreateRow" data-sidebar-key={sidebarKey}>
			{showNewNote ? (
				<button
					type="button"
					className="sidebarQuickActionBtn sidebarNavBtn sidebarNewNoteBtn"
					data-kind="new-note"
					aria-label={t("sidebar.newNote")}
					onClick={onNewNote}
					title={`${newNoteTitle}${
						newNoteShortcut ? ` (${formatShortcutForPlatform(newNoteShortcut)})` : ""
					}`}
				>
					<HugeiconsIcon icon={NewNoteIcon} size="var(--sidebar-icon-size, var(--icon-lg))" />
					<span className="sidebarQuickActionLabel">{t("sidebar.newNote")}</span>
					{newNoteShortcut ? (
						<span className="sidebarQuickActionShortcut">
							{formatShortcutForPlatform(newNoteShortcut)}
						</span>
					) : null}
				</button>
			) : null}
			<span className="sidebarCreateDivider" aria-hidden="true" />
			<SidebarCreateMenu
				showCanvas={showCanvas}
				onNewCanvas={onNewCanvas}
				onOpenPeriodNote={onOpenPeriodNote}
				onOpenQuickNote={onOpenQuickNote}
				onCreateFromTemplate={onCreateFromTemplate}
				getBinding={getBinding}
			/>
		</div>
	);
}
