import {
	CollectionsBookmarkIcon,
	Home01Icon,
	LibraryIcon,
	NoteIcon,
	SearchIcon,
	Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { FILE_TREE_START_RENAME_EVENT } from "../../lib/appEvents";
import { shouldShowGitSync } from "../../lib/gitSyncUi";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import { type GitSyncStatus, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { ChevronDown, ChevronRight } from "../Icons";
import { TagsPane } from "../TagsPane";
import { FileTreePane } from "../filetree";
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
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
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
	spacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => Promise<void>;
	onOpenRecentSpaceAtPath: (path: string) => Promise<void>;
	activeTopSection: "home" | "all-notes" | "databases" | null;
}

function formatSpaceLabel(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	if (parts.length === 0) return path;
	return parts[parts.length - 1] ?? path;
}

function spaceInitial(label: string): string {
	const trimmed = label.trim();
	if (!trimmed) return "G";
	return trimmed.slice(0, 1).toUpperCase();
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
	onMovePath,
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
	spacePath,
	recentSpaces,
	onOpenSpace,
	onOpenRecentSpaceAtPath,
	activeTopSection,
}: SidebarContentProps) {
	// Contexts
	const { getBinding } = useShortcutBindings();
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
		refreshTags,
	} = useFileTreeContext();
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [pendingNewNotePath, setPendingNewNotePath] = useState<string | null>(
		null,
	);
	const [allNotesCount, setAllNotesCount] = useState<number | null>(null);
	const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
	const [gitExpanded, setGitExpanded] = useState(false);
	const [notesExpanded, setNotesExpanded] = useState(true);
	const spaceMenuRef = useRef<HTMLDivElement | null>(null);
	const newNoteShortcut = getBinding("new-note");
	const quickOpenShortcut = getBinding("quick-open");
	const showGitButton = shouldShowGitSync(gitSyncStatus);
	const effectiveGitExpanded = showGitButton && gitExpanded;
	const spaceLabel = spacePath ? formatSpaceLabel(spacePath) : "Glyph";
	const displayRecentSpaces = useMemo(
		() =>
			recentSpaces.filter((path) => path && path !== spacePath).slice(0, 10),
		[recentSpaces, spacePath],
	);

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
		if (!spaceMenuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!(event.target instanceof Node)) return;
			if (spaceMenuRef.current?.contains(event.target)) return;
			setSpaceMenuOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setSpaceMenuOpen(false);
			}
		};
		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [spaceMenuOpen]);

	const handleOpenPicker = useCallback(() => {
		setSpaceMenuOpen(false);
		void onOpenSpace();
	}, [onOpenSpace]);

	const handleOpenAppSettings = useCallback(() => {
		setSpaceMenuOpen(false);
		onOpenSettings();
	}, [onOpenSettings]);

	const handleSwitchToRecent = useCallback(
		(path: string) => {
			setSpaceMenuOpen(false);
			void onOpenRecentSpaceAtPath(path);
		},
		[onOpenRecentSpaceAtPath],
	);

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
						className="sidebarTopRow"
						data-open={spaceMenuOpen ? "true" : "false"}
					>
						<div ref={spaceMenuRef} className="sidebarSpaceMenuAnchor">
							<button
								type="button"
								className="sidebarSpaceSwitcher"
								aria-expanded={spaceMenuOpen}
								onClick={() => setSpaceMenuOpen((value) => !value)}
								title={spacePath ?? "Open space"}
							>
								<span className="sidebarSpaceBadge">
									{spaceInitial(spaceLabel)}
								</span>
								<span className="sidebarSpaceName">{spaceLabel}</span>
								<ChevronDown
									size={12}
									className={
										spaceMenuOpen
											? "sidebarSpaceChevron is-open"
											: "sidebarSpaceChevron"
									}
								/>
							</button>
							<AnimatePresence>
								{spaceMenuOpen ? (
									<m.div
										className="sidebarSpaceMenuPanel"
										initial={{ opacity: 0, y: -6, scale: 0.98 }}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										exit={{ opacity: 0, y: -4, scale: 0.985 }}
										transition={{ duration: 0.14, ease: "easeOut" }}
									>
										<div className="sidebarSpaceMenuTitle">Recent Spaces</div>
										{displayRecentSpaces.length > 0 ? (
											displayRecentSpaces.map((path) => (
												<button
													key={path}
													type="button"
													className="sidebarSpaceMenuItem"
													onClick={() => handleSwitchToRecent(path)}
													title={path}
												>
													<span className="sidebarSpaceMenuItemName">
														{formatSpaceLabel(path)}
													</span>
													<span className="sidebarSpaceMenuItemPath">
														{path}
													</span>
												</button>
											))
										) : (
											<div className="sidebarSpaceMenuEmpty">
												No recent spaces yet.
											</div>
										)}
										<div className="sidebarSpaceMenuActions">
											<button
												type="button"
												className="sidebarSpaceMenuAction"
												onClick={handleOpenPicker}
											>
												Open Spaces
											</button>
											<button
												type="button"
												className="sidebarSpaceMenuIconAction"
												onClick={handleOpenAppSettings}
												aria-label="Open app settings"
												title="Open app settings"
											>
												<HugeiconsIcon
													icon={Settings01Icon}
													size={15}
													strokeWidth={0.9}
												/>
											</button>
										</div>
									</m.div>
								) : null}
							</AnimatePresence>
						</div>
						<button
							type="button"
							className="sidebarTopIconButton"
							onClick={onOpenSearchPalette}
							aria-label="Search notes"
							title={`Search notes${
								quickOpenShortcut
									? ` (${formatShortcutForPlatform(quickOpenShortcut)})`
									: ""
							}`}
						>
							<HugeiconsIcon icon={SearchIcon} size={16} strokeWidth={0.9} />
						</button>
						<button
							type="button"
							className="sidebarTopIconButton sidebarTopNewNoteButton"
							onClick={onNewNote}
							aria-label="Create a new note"
							title={`Create a new note${
								newNoteShortcut
									? ` (${formatShortcutForPlatform(newNoteShortcut)})`
									: ""
							}`}
						>
							<HugeiconsIcon icon={NoteIcon} size={16} strokeWidth={0.9} />
						</button>
					</div>
				</div>
				<div className="sidebarSectionContent">
					<div className="sidebarNavRow">
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="dashboard"
							data-active={activeTopSection === "home" ? "true" : "false"}
							aria-label="Home"
							aria-pressed={activeTopSection === "home"}
							aria-current={activeTopSection === "home" ? "page" : undefined}
							onClick={onOpenCalendar}
							onMouseEnter={onPrefetchCalendar}
							onFocus={onPrefetchCalendar}
							title="Open Home"
						>
							<HugeiconsIcon icon={Home01Icon} size={14} strokeWidth={0.9} />
							<span className="sidebarQuickActionLabel">Home</span>
						</button>
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="all-notes"
							data-active={activeTopSection === "all-notes" ? "true" : "false"}
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
							<span className="sidebarQuickActionLabel">All Notes</span>
							{activeTopSection === "all-notes" && allNotesCount !== null ? (
								<span className="sidebarQuickActionCount">{allNotesCount}</span>
							) : null}
						</button>
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="databases"
							data-active={activeTopSection === "databases" ? "true" : "false"}
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
							<span className="sidebarQuickActionLabel">Collections</span>
						</button>
					</div>
					<div className="sidebarStack">
						<section
							className="sidebarStackItem sidebarStackItemGrow"
							data-section="files"
						>
							<button
								type="button"
								className="sidebarStackHeader sidebarStackHeaderToggle"
								onClick={() => setNotesExpanded((v) => !v)}
								aria-expanded={notesExpanded}
								aria-label={notesExpanded ? "Collapse Notes" : "Expand Notes"}
							>
								<span>Notes</span>
								{notesExpanded ? (
									<ChevronDown
										size={10}
										className="sidebarStackHeaderChevron"
									/>
								) : (
									<ChevronRight
										size={10}
										className="sidebarStackHeaderChevron"
									/>
								)}
							</button>
							{notesExpanded ? (
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
									onMovePath={onMovePath}
									pinnedFiles={pinnedFiles}
									onTogglePinnedFile={togglePinnedFile}
								/>
							) : null}
						</section>
						<section className="sidebarStackItem" data-section="tags">
							<TagsPane
								tags={tags}
								people={people}
								onSelectTag={onSelectTag}
								onSelectPerson={onSelectTag}
								onRefresh={() => void refreshTags()}
							/>
						</section>
					</div>
				</div>
			</div>
			{showGitButton ? (
				<div className="sidebarFooter">
					<GitSyncFooterCard
						status={gitSyncStatus}
						expanded={effectiveGitExpanded}
						onToggleExpanded={() => setGitExpanded((value) => !value)}
					/>
				</div>
			) : null}
		</>
	);
});
