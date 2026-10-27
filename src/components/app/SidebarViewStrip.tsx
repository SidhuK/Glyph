import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { DropdownMenuItem, DropdownMenuItemIcon } from "@/components/ui/shadcn/dropdown-menu";
import {
	ArrowShrinkIcon,
	ExpandParagraphIcon,
	Folder01Icon,
	HistoryIcon,
	MoreHorizontalIcon,
	PinIcon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FileTreeSortMode } from "../../lib/settings";
import type { FileTreeAppearance } from "../../lib/tauri";
import { basename } from "../../utils/path";
import { AppearanceIcon } from "../AppearanceIcon";
import { FileTreeSortMenu } from "../filetree/FileTreeSortMenu";
import { Highlight, HighlightItem } from "../ui/shadcn/highlight";

export type SidebarView =
	| { kind: "files" }
	| { kind: "pinned" }
	| { kind: "recents" }
	| { kind: "tags" }
	| { kind: "folder"; path: string };

export type SidebarViewKind = Exclude<SidebarView["kind"], "folder">;

const SIDEBAR_VIEW_TABS = [
	{ kind: "files", icon: Folder01Icon, labelKey: "sidebar.files" },
	{ kind: "pinned", icon: PinIcon, labelKey: "sidebar.pinned" },
	{ kind: "tags", icon: Tag01Icon, labelKey: "tags.header" },
	{ kind: "recents", icon: HistoryIcon, labelKey: "sidebar.recents" },
] as const;

interface SidebarViewStripProps {
	view: SidebarView;
	folderTabs: string[];
	folderIcons: Record<string, FileTreeAppearance | undefined>;
	sortMode: FileTreeSortMode;
	onSortModeChange: (sortMode: FileTreeSortMode) => void;
	onSelectView: (view: SidebarViewKind) => void;
	onSelectFolder: (folderPath: string) => void;
	onFolderContextMenu: (event: MouseEvent<HTMLButtonElement>, folderPath: string) => void;
	onExpandAllDirs: () => void;
	onCollapseAllDirs: () => void;
}

/** Section header for the lower sidebar: the active view's name, icon tabs that switch
 * views, and one overflow menu for the file tree. */
export function SidebarViewStrip({
	view,
	folderTabs,
	folderIcons,
	sortMode,
	onSortModeChange,
	onSelectView,
	onSelectFolder,
	onFolderContextMenu,
	onExpandAllDirs,
	onCollapseAllDirs,
}: SidebarViewStripProps) {
	const { t } = useTranslation("shell");
	const activeFolderPath = view.kind === "folder" ? view.path : null;
	const activeTabValue = activeFolderPath === null ? view.kind : `folder:${activeFolderPath}`;
	const activeTab = SIDEBAR_VIEW_TABS.find((tab) => tab.kind === view.kind);
	const title = activeFolderPath
		? basename(activeFolderPath)
		: t(activeTab?.labelKey ?? "sidebar.files");
	const showsFileTree = view.kind === "files" || view.kind === "folder";
	const tabsLabel = SIDEBAR_VIEW_TABS.map((tab) => t(tab.labelKey)).join(" / ");

	return (
		<div className="sidebarViewTabsRow">
			<span className="sidebarViewTitle" aria-hidden="true">
				{title}
			</span>
			<div className="sidebarViewTabs" role="tablist" aria-label={tabsLabel}>
				<Highlight value={activeTabValue} className="sidebarViewTabsHighlight">
					{SIDEBAR_VIEW_TABS.map((tab) => (
						<HighlightItem key={tab.kind} value={tab.kind} className="sidebarViewTabSlot">
							<button
								type="button"
								className="sidebarViewTab"
								id={`sidebar-${tab.kind}-tab`}
								role="tab"
								aria-label={t(tab.labelKey)}
								title={t(tab.labelKey)}
								aria-selected={view.kind === tab.kind}
								aria-controls={`sidebar-${tab.kind}-panel`}
								onClick={() => onSelectView(tab.kind)}
							>
								<HugeiconsIcon
									icon={tab.icon}
									size="var(--icon-md)"
									className="sidebarViewTabIcon"
									aria-hidden="true"
								/>
							</button>
						</HighlightItem>
					))}
					{folderTabs.map((folderPath, index) => {
						const iconName = folderIcons[folderPath]?.icon;
						return (
							<HighlightItem
								key={folderPath}
								value={`folder:${folderPath}`}
								className="sidebarViewTabSlot"
							>
								<button
									type="button"
									className="sidebarViewTab"
									id={`sidebar-folder-tab-${index + 1}`}
									role="tab"
									aria-label={t("sidebar.openFolderTab", { folder: folderPath })}
									aria-selected={activeFolderPath === folderPath}
									aria-controls="sidebar-files-panel"
									title={folderPath}
									onClick={() => onSelectFolder(folderPath)}
									onContextMenu={(event) => onFolderContextMenu(event, folderPath)}
								>
									{iconName ? (
										<AppearanceIcon
											iconName={iconName}
											size="var(--icon-md)"
											className="sidebarViewTabIcon"
										/>
									) : (
										<HugeiconsIcon
											icon={Folder01Icon}
											size="var(--icon-md)"
											className="sidebarViewTabIcon"
											aria-hidden="true"
										/>
									)}
								</button>
							</HighlightItem>
						);
					})}
				</Highlight>
			</div>
			{showsFileTree ? (
				<FileTreeSortMenu
					sortMode={sortMode}
					onSortModeChange={onSortModeChange}
					triggerClassName="sidebarViewMenuTrigger"
					triggerLabel={t("sidebar.fileTreeOptions")}
					icon={MoreHorizontalIcon}
					iconSize="var(--icon-md)"
				>
					<DropdownMenuItem onClick={onExpandAllDirs}>
						<DropdownMenuItemIcon icon={ExpandParagraphIcon} />
						<span className="glyphMenuItemLabel">{t("sidebar.expandAllFolders")}</span>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onCollapseAllDirs}>
						<DropdownMenuItemIcon icon={ArrowShrinkIcon} />
						<span className="glyphMenuItemLabel">{t("sidebar.collapseAllFolders")}</span>
					</DropdownMenuItem>
				</FileTreeSortMenu>
			) : (
				<span className="sidebarViewMenuTrigger" aria-hidden="true" />
			)}
		</div>
	);
}
