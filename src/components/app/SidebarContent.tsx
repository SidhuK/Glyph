import {
	Clock01Icon,
	CollectionsBookmarkIcon,
	DocumentCodeIcon,
	Home01Icon,
	LibraryIcon,
	NoteIcon,
	SearchIcon,
	Settings01Icon,
	Tag01Icon,
	TaskAdd02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { FILE_TREE_START_RENAME_EVENT } from "../../lib/appEvents";
import { shouldShowGitSync } from "../../lib/gitSyncUi";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { type GitSyncStatus, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { FileTreePane } from "../FileTreePane";
import { ChevronDown, Files, FolderPlus } from "../Icons";
import { RecentFilesPane } from "../RecentFilesPane";
import { TagsPane } from "../TagsPane";
import { directionVariants } from "../ui/animations";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/shadcn/tabs";
import { GitSyncFooterCard } from "./GitSyncFooterCard";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onRenameDir: (
		dirPath: string,
		nextName: string,
		kind: "dir" | "file",
	) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onSelectTag: (tag: string) => void;
	onOpenCalendar: () => void;
	onOpenDatabases: (databaseId?: string | null) => void;
	onPrefetchCalendar: () => void;
	onPrefetchDatabases: (databaseId?: string | null) => void;
	onPrefetchAllDocs: () => void;
	onPrefetchFile: (relPath: string) => void;
	gitSyncStatus: GitSyncStatus | null;
	onOpenSettings: () => void;
	onOpenAllDocs: () => void;
	onOpenSearchPalette: () => void;
	activeTopSection: "home" | "all-notes" | "databases" | null;
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
	onDuplicateFile,
	onRenameDir,
	onDeletePath,
	onSelectTag,
	onOpenCalendar,
	onOpenDatabases,
	onPrefetchCalendar,
	onPrefetchDatabases,
	onPrefetchAllDocs,
	onPrefetchFile,
	gitSyncStatus,
	onOpenSettings,
	onOpenAllDocs,
	onOpenSearchPalette,
	activeTopSection,
}: SidebarContentProps) {
	// Contexts
	const { spacePath } = useSpace();
	const {
		rootEntries,
		childrenByDir,
		expandedDirs,
		activeDirPath,
		activeFilePath,
		pinnedFiles,
		togglePinnedFile,
		tags,
		people,
		tagsError,
		refreshTags,
	} = useFileTreeContext();
	const { sidebarViewMode, setSidebarViewMode } = useUILayoutContext();
	const { recentFiles, refreshRecentFiles } = useRecentFiles(spacePath, 15);
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [pendingNewNotePath, setPendingNewNotePath] = useState<string | null>(
		null,
	);
	const [allNotesCount, setAllNotesCount] = useState<number | null>(null);
	const [newMenuOpen, setNewMenuOpen] = useState(false);
	const [gitExpanded, setGitExpanded] = useState(false);
	const newMenuRef = useRef<HTMLDivElement | null>(null);
	const showGitButton = shouldShowGitSync(gitSyncStatus);
	const effectiveGitExpanded = showGitButton && gitExpanded;

	const handleStartRename = useCallback((path: string) => {
		const nextPath = path.trim();
		if (!nextPath) return;
		setRenamingPath(nextPath);
		setPendingNewNotePath(nextPath);
	}, []);

	useEffect(() => {
		const handleStartRenameEvent = (event: Event) => {
			const customEvent = event as CustomEvent<{ path?: string }>;
			const path = customEvent.detail?.path;
			if (!path) return;
			handleStartRename(path);
		};
		window.addEventListener(
			FILE_TREE_START_RENAME_EVENT,
			handleStartRenameEvent,
		);
		return () =>
			window.removeEventListener(
				FILE_TREE_START_RENAME_EVENT,
				handleStartRenameEvent,
			);
	}, [handleStartRename]);

	useEffect(() => {
		if (!renamingPath) return;
		let cancelled = false;
		let retryTimer: number | null = null;
		let firstFrame: number | null = null;
		let secondFrame: number | null = null;
		let attempts = 0;

		const tryCenterRenameTarget = () => {
			if (cancelled) return;
			attempts += 1;
			const escapedPath =
				typeof CSS !== "undefined" && typeof CSS.escape === "function"
					? CSS.escape(renamingPath)
					: renamingPath;
			const target = document.querySelector<HTMLElement>(
				`[data-file-tree-path="${escapedPath}"]`,
			);
			if (target) {
				target.scrollIntoView({
					block: "center",
					inline: "nearest",
					behavior: "auto",
				});
				return;
			}
			if (attempts >= 10) return;
			retryTimer = window.setTimeout(tryCenterRenameTarget, 45);
		};

		firstFrame = window.requestAnimationFrame(() => {
			secondFrame = window.requestAnimationFrame(() => {
				tryCenterRenameTarget();
			});
		});

		return () => {
			cancelled = true;
			if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
			if (retryTimer !== null) window.clearTimeout(retryTimer);
		};
	}, [renamingPath]);

	const handleCancelRename = useCallback(() => {
		setRenamingPath(null);
		setPendingNewNotePath(null);
	}, []);

	const handleCommitDirRename = useCallback(
		async (dirPath: string, nextName: string) => {
			const renamed = await onRenameDir(dirPath, nextName, "dir");
			if (renamed) {
				setRenamingPath(null);
			}
		},
		[onRenameDir],
	);

	const handleCommitFileRename = useCallback(
		async (path: string, nextName: string) => {
			const renamed = await onRenameDir(path, nextName, "file");
			if (!renamed) return;
			setRenamingPath(null);
			if (pendingNewNotePath === path) {
				onOpenFile(renamed);
				setPendingNewNotePath(null);
			}
		},
		[onOpenFile, onRenameDir, pendingNewNotePath],
	);

	const refreshAllNotesCount = useCallback(() => {
		if (!spacePath) {
			setAllNotesCount(null);
			return;
		}
		void invoke("all_docs_list", { limit: 5000 })
			.then((items) => {
				setAllNotesCount(items.length);
			})
			.catch(() => {
				setAllNotesCount(null);
			});
	}, [spacePath]);

	useEffect(() => {
		refreshAllNotesCount();
	}, [refreshAllNotesCount]);

	useTauriEvent("notes:external_changed", () => {
		refreshAllNotesCount();
	});

	useEffect(() => {
		if (!newMenuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!(event.target instanceof Node)) return;
			if (newMenuRef.current?.contains(event.target)) return;
			setNewMenuOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setNewMenuOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [newMenuOpen]);

	const runNewMenuAction = useCallback((action: () => void) => {
		setNewMenuOpen(false);
		action();
	}, []);

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
					<div
						ref={newMenuRef}
						className="sidebarNewActionGroup"
						data-open={newMenuOpen ? "true" : "false"}
					>
						<div className="sidebarQuickActionSplit" data-kind="new-note">
							<button
								type="button"
								className="sidebarQuickActionBtn sidebarQuickActionPrimary"
								data-kind="new-note"
								onClick={onNewNote}
								title={`Create a new note (${getShortcutTooltip({ meta: true, key: "n" })})`}
							>
								<HugeiconsIcon icon={NoteIcon} size={14} strokeWidth={0.9} />
								<span className="sidebarQuickActionLabel">New Note</span>
							</button>
							<button
								type="button"
								className="sidebarQuickActionBtn sidebarQuickActionChevron"
								data-kind="new-note"
								aria-label="Open new note menu"
								aria-expanded={newMenuOpen}
								title="More create options"
								onClick={() => setNewMenuOpen((value) => !value)}
							>
								<ChevronDown
									size={12}
									className={
										newMenuOpen
											? "sidebarQuickActionChevronIcon is-open"
											: "sidebarQuickActionChevronIcon"
									}
								/>
							</button>
						</div>
						<AnimatePresence>
							{newMenuOpen ? (
								<m.div
									className="sidebarQuickActionMenu"
									initial={{ opacity: 0, y: -6, scale: 0.98 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									exit={{ opacity: 0, y: -4, scale: 0.985 }}
									transition={{ duration: 0.14, ease: "easeOut" }}
								>
									<button
										type="button"
										className="sidebarQuickActionMenuItem"
										onClick={() =>
											runNewMenuAction(() => onCreateFromTemplateInDir(""))
										}
									>
										<HugeiconsIcon
											icon={DocumentCodeIcon}
											size={15}
											strokeWidth={0.9}
										/>
										<span>Template</span>
									</button>
									<button
										type="button"
										className="sidebarQuickActionMenuItem"
										onClick={() =>
											runNewMenuAction(() => {
												void onNewDatabaseInDir("");
											})
										}
									>
										<HugeiconsIcon
											icon={LibraryIcon}
											size={15}
											strokeWidth={0.9}
										/>
										<span>Collection</span>
									</button>
									<button
										type="button"
										className="sidebarQuickActionMenuItem"
										onClick={() => runNewMenuAction(onOpenCalendar)}
									>
										<HugeiconsIcon
											icon={TaskAdd02Icon}
											size={15}
											strokeWidth={0.9}
										/>
										<span>Task</span>
									</button>
									<button
										type="button"
										className="sidebarQuickActionMenuItem"
										onClick={() =>
											runNewMenuAction(() => {
												void onNewFolderInDir("");
											})
										}
									>
										<FolderPlus size={15} />
										<span>Folder</span>
									</button>
								</m.div>
							) : null}
						</AnimatePresence>
					</div>
					<button
						type="button"
						className="sidebarQuickActionBtn sidebarSearchBtn"
						onClick={onOpenSearchPalette}
						title={`Search notes (${getShortcutTooltip({ meta: true, key: "p" })})`}
					>
						<HugeiconsIcon icon={SearchIcon} size={14} strokeWidth={0.9} />
						<span className="sidebarQuickActionLabel">Search Notes</span>
						<span className="sidebarSearchShortcut">
							{getShortcutTooltip({ meta: true, key: "p" })}
						</span>
					</button>
					<div className="sidebarQuickActionsSpacer" aria-hidden="true" />
					<div className="sidebarNavRow">
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="dashboard"
							data-expanded={activeTopSection === "home" ? "true" : "false"}
							aria-label="Home"
							aria-pressed={activeTopSection === "home"}
							aria-current={activeTopSection === "home" ? "page" : undefined}
							onClick={onOpenCalendar}
							onMouseEnter={onPrefetchCalendar}
							onFocus={onPrefetchCalendar}
							title="Open Home"
						>
							<HugeiconsIcon
								icon={Home01Icon}
								size={14}
								strokeWidth={0.9}
								className="sidebarQuickActionHomeIcon"
							/>
							{activeTopSection === "home" ? (
								<span className="sidebarQuickActionLabel">Home</span>
							) : null}
						</button>
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="all-notes"
							data-expanded={
								activeTopSection === "all-notes" ? "true" : "false"
							}
							aria-label={
								allNotesCount !== null
									? `All Notes (${allNotesCount})`
									: "All Notes"
							}
							aria-pressed={activeTopSection === "all-notes"}
							aria-current={
								activeTopSection === "all-notes" ? "page" : undefined
							}
							onClick={onOpenAllDocs}
							onMouseEnter={onPrefetchAllDocs}
							onFocus={onPrefetchAllDocs}
							title="Open All Notes"
						>
							<HugeiconsIcon
								icon={CollectionsBookmarkIcon}
								size={14}
								strokeWidth={0.9}
							/>
							{activeTopSection === "all-notes" ? (
								<span className="sidebarQuickActionLabel">All Notes</span>
							) : null}
							{activeTopSection === "all-notes" && allNotesCount !== null ? (
								<span className="sidebarQuickActionCount">{allNotesCount}</span>
							) : null}
						</button>
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="databases"
							data-expanded={
								activeTopSection === "databases" ? "true" : "false"
							}
							aria-label="Collections"
							aria-pressed={activeTopSection === "databases"}
							aria-current={
								activeTopSection === "databases" ? "page" : undefined
							}
							onClick={() => {
								onOpenDatabases();
							}}
							onMouseEnter={() => onPrefetchDatabases()}
							onFocus={() => onPrefetchDatabases()}
							title="Open Collections"
						>
							<HugeiconsIcon icon={LibraryIcon} size={14} strokeWidth={0.9} />
							{activeTopSection === "databases" ? (
								<span className="sidebarQuickActionLabel">Collections</span>
							) : null}
						</button>
					</div>
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
								{sidebarViewMode === "files" ? <span>Files</span> : null}
							</TabsTrigger>
							<TabsTrigger value="tags" title="Tags" data-kind="tags">
								<HugeiconsIcon icon={Tag01Icon} size={14} strokeWidth={0.9} />
								{sidebarViewMode === "tags" ? <span>Tags</span> : null}
							</TabsTrigger>
							<TabsTrigger
								value="recent"
								title="Recent Files"
								data-kind="recent"
							>
								<HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={0.9} />
								{sidebarViewMode === "recent" ? (
									<span>Recent Files</span>
								) : null}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
				<AnimatePresence mode="wait">
					{sidebarViewMode === "files" ? (
						<m.div
							key="files"
							{...directionVariants.left}
							transition={{ duration: 0.18 }}
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
								onPrefetchFile={onPrefetchFile}
								onNewFileInDir={onNewFileInDir}
								onCreateFromTemplateInDir={onCreateFromTemplateInDir}
								onNewDatabaseInDir={onNewDatabaseInDir}
								onNewFolderInDir={onNewFolderInDir}
								onDuplicateFile={onDuplicateFile}
								onDeletePath={onDeletePath}
								renamingPath={renamingPath}
								onStartRename={handleStartRename}
								onCancelRename={handleCancelRename}
								onCommitFileRename={handleCommitFileRename}
								onCommitDirRename={handleCommitDirRename}
								pinnedFiles={pinnedFiles}
								onTogglePinnedFile={togglePinnedFile}
							/>
						</m.div>
					) : null}
					{sidebarViewMode === "recent" ? (
						<m.div
							key="recent"
							{...directionVariants.right}
							transition={{ duration: 0.18 }}
							className="sidebarSectionContent"
						>
							<ScrollArea className="h-full">
								<RecentFilesPane
									recentFiles={recentFiles}
									activeFilePath={activeFilePath}
									onOpenFile={onOpenFile}
									onPrefetchFile={onPrefetchFile}
									onRefresh={() => void refreshRecentFiles()}
								/>
							</ScrollArea>
						</m.div>
					) : null}
					{sidebarViewMode === "tags" ? (
						<m.div
							key="tags"
							{...directionVariants.right}
							transition={{ duration: 0.18 }}
							className="sidebarSectionContent"
						>
							<ScrollArea className="h-full">
								{tagsError ? (
									<div className="searchError">{tagsError}</div>
								) : null}
								<TagsPane
									tags={tags}
									people={people}
									onSelectTag={onSelectTag}
									onSelectPerson={onSelectTag}
									onRefresh={() => void refreshTags()}
								/>
							</ScrollArea>
						</m.div>
					) : null}
				</AnimatePresence>
			</div>
			<div className="sidebarFooter">
				<button
					type="button"
					className="sidebarQuickActionBtn sidebarFooterSettingsButton"
					onClick={onOpenSettings}
					title="Open settings"
					aria-label="Open settings"
					data-kind="settings"
				>
					<HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={0.9} />
				</button>
				{showGitButton ? (
					<GitSyncFooterCard
						status={gitSyncStatus}
						expanded={effectiveGitExpanded}
						onToggleExpanded={() => setGitExpanded((value) => !value)}
					/>
				) : null}
			</div>
		</>
	);
});
