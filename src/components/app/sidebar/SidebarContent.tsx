import { useUILayoutContext } from "@/contexts";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { SidebarCalendar } from "../calendar/SidebarCalendar";
import { SidebarLibrary } from "./SidebarLibrary";
import { SidebarNavGroup } from "./SidebarNavGroup";
import type { SidebarContentProps } from "./sidebarContentProps";

/** The sidebar's groups between the header and the footer: nav | library | calendar, each
 * separated by an inset hairline. */
export const SidebarContent = memo(function SidebarContent({
	onExpandAllDirs,
	onCollapseAllDirs,
	onSelectTag,
	onToggleDir,
	onLoadDir,
	onSelectDir,
	onOpenFile,
	onPrefetchFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onImportFilesInDir,
	onImportFolderInDir,
	onImportPathsInDir,
	onRequestCreateFolder,
	onDuplicateFile,
	onRenameDir,
	onDeletePath,
	onMovePath,
	onOpenPeriodNoteAtDate,
	spacePath,
	...navProps
}: SidebarContentProps) {
	const { t } = useTranslation("shell");
	const { sidebarVisibility } = useUILayoutContext();

	if (!spacePath) {
		return (
			<div className="sidebarSection sidebarSectionGrow sidebarEmpty">
				<div className="sidebarEmptyTitle">{t("sidebarSpace.noSpaceTitle")}</div>
				<div className="sidebarEmptyHint">{t("sidebarSpace.noSpaceHint")}</div>
			</div>
		);
	}

	return (
		<div className="sidebarSection sidebarSectionGrow">
			<div className="sidebarSectionContent">
				<SidebarNavGroup {...navProps} spacePath={spacePath} />
				<hr className="sidebarGroupDivider" data-group="library" />
				<SidebarLibrary
					spacePath={spacePath}
					onExpandAllDirs={onExpandAllDirs}
					onCollapseAllDirs={onCollapseAllDirs}
					onSelectTag={onSelectTag}
					onToggleDir={onToggleDir}
					onLoadDir={onLoadDir}
					onSelectDir={onSelectDir}
					onOpenFile={onOpenFile}
					onPrefetchFile={onPrefetchFile}
					onNewFileInDir={onNewFileInDir}
					onCreateFromTemplateInDir={onCreateFromTemplateInDir}
					onImportFilesInDir={onImportFilesInDir}
					onImportFolderInDir={onImportFolderInDir}
					onImportPathsInDir={onImportPathsInDir}
					onRequestCreateFolder={onRequestCreateFolder}
					onDuplicateFile={onDuplicateFile}
					onRenameDir={onRenameDir}
					onDeletePath={onDeletePath}
					onMovePath={onMovePath}
				/>
				{sidebarVisibility.calendar ? (
					<>
						<hr className="sidebarGroupDivider" data-group="calendar" />
						<SidebarCalendar
							onOpenPeriodNoteAtDate={onOpenPeriodNoteAtDate}
							onOpenFile={onOpenFile}
						/>
					</>
				) : null}
			</div>
		</div>
	);
});
