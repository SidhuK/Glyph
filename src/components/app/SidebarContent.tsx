import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import { memo, useCallback } from "react";
import { toast } from "sonner";
import {
	useFileTreeContext,
	useUILayoutContext,
	useVault,
} from "../../contexts";
import { useViewContext } from "../../contexts";
import { openSettingsWindow } from "../../lib/windows";
import { parentDir } from "../../utils/path";
import { FileTreePane } from "../FileTreePane";
import { Calendar, Files, FolderPlus, Plus } from "../Icons";
import { TagsPane } from "../TagsPane";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/shadcn/tabs";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onSelectTag: (tag: string) => void;
	onOpenDailyNote: () => void;
	isDailyNoteCreating: boolean;
	onOpenTasks: () => void;
}

const SIDEBAR_FOOTER_STYLE = {
	display: "grid",
	gridTemplateColumns: "auto 1fr auto",
	alignItems: "center",
} as const;

const ACTIONS_STYLE = { justifySelf: "end" } as const;

export const SidebarContent = memo(function SidebarContent({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	onDeletePath,
	onSelectTag,
	onOpenDailyNote,
	isDailyNoteCreating,
	onOpenTasks,
}: SidebarContentProps) {
	// Contexts
	const { vaultPath } = useVault();
	const { activeViewDoc } = useViewContext();
	const {
		rootEntries,
		childrenByDir,
		expandedDirs,
		activeFilePath,
		tags,
		tagsError,
		refreshTags,
	} = useFileTreeContext();
	const { sidebarViewMode, setSidebarViewMode, dailyNotesFolder } =
		useUILayoutContext();

	const handleDailyNoteClick = useCallback(() => {
		if (!dailyNotesFolder) {
			toast.error("Daily Notes folder not configured", {
				description: "Go to Settings to configure a folder for daily notes.",
			});
			return;
		}
		onOpenDailyNote();
	}, [dailyNotesFolder, onOpenDailyNote]);

	const targetDir = activeFilePath ? parentDir(activeFilePath) : "";
	const activeDirPath =
		activeViewDoc?.kind === "folder" ? (activeViewDoc.selector ?? "") : null;

	if (!vaultPath) {
		return (
			<>
				<div className="sidebarSection sidebarEmpty">
					<div className="sidebarEmptyTitle">No vault open</div>
					<div className="sidebarEmptyHint">
						Open or create a vault to get started.
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
						onClick={onOpenTasks}
						title="Open Tasks"
					>
						<HugeiconsIcon icon={Icons.NoteDoneIcon} size={14} />
						<span className="dailyNotesLabel">Tasks</span>
					</button>
					<button
						type="button"
						className="sidebarDailyNotesBtn"
						onClick={handleDailyNoteClick}
						disabled={isDailyNoteCreating}
						title="Open today's daily note"
					>
						<Calendar size={14} />
						<span className="dailyNotesLabel">Daily Note</span>
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
								<HugeiconsIcon icon={Icons.Tag01Icon} size={14} />
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
			<div className="sidebarFooter" style={SIDEBAR_FOOTER_STYLE}>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => void openSettingsWindow()}
					title="Settings"
				>
					<HugeiconsIcon icon={Icons.Settings05Icon} size={14} />
				</Button>
				<span className="settingsPill sidebarEarlyAccessBadge earlyAccessBadge">
					Early Access
				</span>
				<div style={ACTIONS_STYLE}>
					{sidebarViewMode === "files" && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									title={`Add in ${targetDir || "vault root"}`}
								>
									<Plus size={14} />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								side="top"
								className="fileTreeCreateMenu"
							>
								<DropdownMenuItem
									className="fileTreeCreateMenuItem"
									onSelect={() => void onNewFileInDir(targetDir)}
								>
									<Plus size={14} />
									Add file
								</DropdownMenuItem>
								<DropdownMenuSeparator className="fileTreeCreateMenuSeparator" />
								<DropdownMenuItem
									className="fileTreeCreateMenuItem"
									onSelect={() => void onNewFolderInDir(targetDir)}
								>
									<FolderPlus size={14} />
									Add folder
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>
		</>
	);
});
