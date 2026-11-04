import { useFileTreeContext } from "@/contexts";
import { useFileTreeSortMode } from "@/hooks/useFileTreeSortMode";
import { toast } from "@/lib/toast";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { type SidebarFileTreeProps, SidebarFilesPanel } from "./SidebarFilesPanel";
import { SidebarLibraryPanels } from "./SidebarLibraryPanels";
import { SidebarLibraryRail } from "./SidebarLibraryRail";
import { SidebarViewStrip } from "./SidebarViewStrip";
import type { SidebarContentProps } from "./sidebarContentProps";
import { useSidebarRail } from "./sidebarRailContext";
import { useSidebarLibraryFlyout } from "./useSidebarLibraryFlyout";
import { useSidebarView } from "./useSidebarView";

export type SidebarLibraryProps = SidebarFileTreeProps &
	Pick<SidebarContentProps, "onExpandAllDirs" | "onCollapseAllDirs" | "onSelectTag">;

/** The lower sidebar: the view strip (Files, Pinned, Tags, Recents, quick folders) over the
 * active view's panel. Expanded, the body sits in the sidebar; in the rail, a stack of view
 * icons opens it in a flyout. The body renders once, through a portal into a node the slot
 * and the flyout take turns holding (see useSidebarLibraryFlyout). */
export function SidebarLibrary({
	onExpandAllDirs,
	onCollapseAllDirs,
	onSelectTag,
	...fileTreeProps
}: SidebarLibraryProps) {
	const { spacePath, onOpenFile } = fileTreeProps;
	const { t } = useTranslation("shell");
	const { rail } = useSidebarRail();
	const { itemAppearance, sidebarFolderTabs } = useFileTreeContext();
	const view = useSidebarView(fileTreeProps.onSelectDir);
	const flyout = useSidebarLibraryFlyout(rail);
	const fileTreeSort = useFileTreeSortMode({
		onError: (message) => {
			toast.error(t("sidebar.fileTreeSortUpdateFailed"), {
				description: message,
			});
		},
	});
	const { close: closeFlyout } = flyout;
	const handleOpenListedFile = useCallback(
		(path: string) => {
			onOpenFile(path);
			closeFlyout();
		},
		[closeFlyout, onOpenFile],
	);

	return (
		<div className="sidebarLibrary" data-slot="sidebar-library">
			{rail ? (
				<SidebarLibraryRail
					view={view.activeSidebarView}
					folderTabs={sidebarFolderTabs}
					folderIcons={itemAppearance}
					flyout={flyout}
					onSelectView={view.handleSidebarViewChange}
					onSelectFolder={view.handleSelectSidebarFolder}
					onFolderContextMenu={view.handleFolderTabContextMenu}
				/>
			) : null}
			<div ref={flyout.attachSlot} className="sidebarLibrarySlot" />
			{createPortal(
				<>
					<SidebarViewStrip
						view={view.activeSidebarView}
						folderTabs={sidebarFolderTabs}
						folderIcons={itemAppearance}
						sortMode={fileTreeSort.sortMode}
						onSortModeChange={(sortMode) => {
							void fileTreeSort.setSortMode(sortMode);
						}}
						onSelectView={view.handleSidebarViewChange}
						onSelectFolder={view.handleSelectSidebarFolder}
						onFolderContextMenu={view.handleFolderTabContextMenu}
						onExpandAllDirs={() => {
							void onExpandAllDirs();
						}}
						onCollapseAllDirs={onCollapseAllDirs}
					/>
					<div className="sidebarViewContent">
						<SidebarFilesPanel
							{...fileTreeProps}
							view={view.activeSidebarView}
							onSelectFolioFolder={view.handleSelectFolioFolder}
							onSelectView={view.handleSidebarViewChange}
							onToggleSidebarFolderTab={view.handleToggleSidebarFolderTab}
							onFileRowClick={closeFlyout}
						/>
						<SidebarLibraryPanels
							view={view.activeSidebarView}
							spacePath={spacePath}
							onOpenFile={handleOpenListedFile}
							onSelectTag={onSelectTag}
							onActivate={closeFlyout}
						/>
					</div>
				</>,
				flyout.host,
			)}
		</div>
	);
}
