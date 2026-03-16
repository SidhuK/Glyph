import {
	CalendarAdd01Icon,
	CheckListIcon,
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
import { FileTreePane } from "../FileTreePane";
import { Files } from "../Icons";
import { TagsPane } from "../TagsPane";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/shadcn/tabs";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onSelectTag: (tag: string) => void;
	onOpenDailyNote: () => void;
	isDailyNoteCreating: boolean;
	onOpenTasks: () => void;
}

export const SidebarContent = memo(function SidebarContent({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewNote,
	onNewFileInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onRenameDir,
	onDeletePath,
	onSelectTag,
	onOpenDailyNote,
	isDailyNoteCreating,
	onOpenTasks,
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
						className="sidebarDailyNotesBtn"
						data-kind="new-note"
						onClick={onNewNote}
						title="Create a new note"
					>
						<HugeiconsIcon icon={NoteIcon} size={14} strokeWidth={1.8} />
						<span className="dailyNotesLabel">New Note</span>
					</button>
					<button
						type="button"
						className="sidebarDailyNotesBtn"
						data-kind="daily-notes"
						onClick={onOpenDailyNote}
						disabled={isDailyNoteCreating}
						title="Open today's daily note"
					>
						<HugeiconsIcon
							icon={CalendarAdd01Icon}
							size={14}
							strokeWidth={1.8}
						/>
						<span className="dailyNotesLabel">Daily Note</span>
					</button>
					<button
						type="button"
						className="sidebarDailyNotesBtn"
						data-kind="tasks"
						onClick={onOpenTasks}
						title="Open Tasks"
					>
						<HugeiconsIcon icon={CheckListIcon} size={14} strokeWidth={1.8} />
						<span className="dailyNotesLabel">Tasks</span>
					</button>
				</div>
				<div className="sidebarSectionHeader">
					<Tabs
						value={sidebarViewMode}
						onValueChange={(value) =>
							setSidebarViewMode(value as "files" | "tags")
						}
						className="sidebarSectionToggle"
					>
						<TabsList className="w-full rounded-full bg-transparent">
							<TabsTrigger value="files" title="Files">
								<Files size={14} />
							</TabsTrigger>
							<TabsTrigger value="tags" title="Tags">
								<HugeiconsIcon icon={Tag01Icon} size={14} />
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<AnimatePresence mode="wait">
					{sidebarViewMode === "files" && (
						<m.div
							key="files"
							initial={{ x: -20 }}
							animate={{ x: 0 }}
							exit={{ x: -20 }}
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
							initial={{ x: 20 }}
							animate={{ x: 0 }}
							exit={{ x: 20 }}
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
				</AnimatePresence>
			</div>
		</>
	);
});
