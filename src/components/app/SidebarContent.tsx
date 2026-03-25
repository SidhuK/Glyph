import {
	Clock01Icon,
	DashboardSquare01Icon,
	NoteIcon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import { memo } from "react";
import {
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { FileTreePane } from "../FileTreePane";
import { Database, Files } from "../Icons";
import { RecentFilesPane } from "../RecentFilesPane";
import { TagsPane } from "../TagsPane";
import { directionVariants } from "../ui/animations";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/shadcn/tabs";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onSelectTag: (tag: string) => void;
	onOpenCalendar: () => void;
	onOpenDatabases: (databaseId?: string | null) => void;
}

export const SidebarContent = memo(function SidebarContent({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewNote,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onRenameDir,
	onDeletePath,
	onSelectTag,
	onOpenCalendar,
	onOpenDatabases,
}: SidebarContentProps) {
	// Contexts
	const { spacePath } = useSpace();
	const {
		rootEntries,
		childrenByDir,
		expandedDirs,
		activeDirPath,
		activeFilePath,
		tags,
		tagsError,
		refreshTags,
	} = useFileTreeContext();
	const { sidebarViewMode, setSidebarViewMode } = useUILayoutContext();
	const { recentFiles, refreshRecentFiles } = useRecentFiles(spacePath, 15);

	if (!spacePath) {
		return (
			<>
				<div className="sidebarSection sidebarEmpty">
					<div className="sidebarEmptyTitle">No space open</div>
					<div className="sidebarEmptyHint">
						Open or create a space to get started.
					</div>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="sidebarSection sidebarSectionGrow">
				<div className="sidebarQuickActions">
					<button
						type="button"
						className="sidebarQuickActionBtn sidebarQuickActionBtnAccent"
						data-kind="new-note"
						onClick={onNewNote}
						title={`Create a new note (${getShortcutTooltip({ meta: true, key: "n" })})`}
					>
						<HugeiconsIcon icon={NoteIcon} size={14} />
						<span className="sidebarQuickActionLabel">New Note</span>
					</button>
					<button
						type="button"
						className="sidebarQuickActionBtn"
						data-kind="dashboard"
						onClick={onOpenCalendar}
						title="Open Dashboard"
					>
						<HugeiconsIcon icon={DashboardSquare01Icon} size={14} />
						<span className="sidebarQuickActionLabel">Dashboard</span>
					</button>
					<button
						type="button"
						className="sidebarQuickActionBtn"
						data-kind="databases"
						onClick={() => onOpenDatabases()}
						title="Open Databases"
					>
						<Database size={14} />
						<span className="sidebarQuickActionLabel">Databases</span>
					</button>
				</div>
				<div className="sidebarSectionHeader">
					<Tabs
						value={sidebarViewMode}
						onValueChange={(value) =>
							setSidebarViewMode(value as "files" | "tags" | "recent")
						}
						className="sidebarSectionToggle"
					>
							<TabsList className="w-full rounded-full bg-transparent">
								<TabsTrigger value="files" title="Files" data-kind="files">
									<Files size={14} />
								</TabsTrigger>
								<TabsTrigger value="tags" title="Tags" data-kind="tags">
									<HugeiconsIcon icon={Tag01Icon} size={14} />
								</TabsTrigger>
								<TabsTrigger value="recent" title="Recent" data-kind="recent">
									<HugeiconsIcon icon={Clock01Icon} size={14} />
								</TabsTrigger>
							</TabsList>
					</Tabs>
				</div>
				<AnimatePresence mode="wait">
					{sidebarViewMode === "files" && (
						<m.div
							key="files"
							{...directionVariants.left}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
						>
							<FileTreePane
								rootEntries={rootEntries}
								childrenByDir={childrenByDir}
								expandedDirs={expandedDirs}
								activeFilePath={activeFilePath}
								activeDirPath={activeDirPath}
								onToggleDir={onToggleDir}
								onSelectDir={onSelectDir}
								onOpenFile={onOpenFile}
								onNewFileInDir={onNewFileInDir}
								onCreateFromTemplateInDir={onCreateFromTemplateInDir}
								onNewDatabaseInDir={onNewDatabaseInDir}
								onNewFolderInDir={onNewFolderInDir}
								onRenameDir={onRenameDir}
								onDeletePath={onDeletePath}
							/>
						</m.div>
					)}
					{sidebarViewMode === "tags" && (
						<m.div
							key="tags"
							{...directionVariants.right}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
						>
							<ScrollArea className="h-full">
								{tagsError ? (
									<div className="searchError">{tagsError}</div>
								) : null}
								<TagsPane
									tags={tags}
									onSelectTag={onSelectTag}
									onRefresh={() => void refreshTags()}
								/>
							</ScrollArea>
						</m.div>
					)}
					{sidebarViewMode === "recent" && (
						<m.div
							key="recent"
							{...directionVariants.right}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
						>
							<ScrollArea className="h-full">
								<RecentFilesPane
									recentFiles={recentFiles}
									activeFilePath={activeFilePath}
									onOpenFile={onOpenFile}
									onRefresh={() => void refreshRecentFiles()}
								/>
							</ScrollArea>
						</m.div>
					)}
				</AnimatePresence>
			</div>
		</>
	);
});
