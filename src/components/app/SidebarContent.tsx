import {
	ArrowShrinkIcon,
	CollectionsBookmarkIcon,
	ExpandParagraphIcon,
	Home01Icon,
	LibraryIcon,
	NoteIcon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { FILE_TREE_START_RENAME_EVENT } from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadAllDocs, navigationQueryKeys } from "../../lib/navigationPrefetch";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import type { FsEntry } from "../../lib/tauri";
import { ChevronDown, ChevronRight } from "../Icons";
import { TagsPane } from "../TagsPane";
import { FileTreePane } from "../filetree";
import { LicenseStatusFooter } from "../licensing/LicenseStatusFooter";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onLoadDir: (dirPath: string, force?: boolean) => Promise<void>;
	onExpandAllDirs: () => Promise<void>;
	onCollapseAllDirs: () => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
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
	onOpenAllDocs: () => void;
	onOpenCommandPalette: () => void;
	spacePath: string | null;
	activeTopSection: "home" | "all-notes" | "databases" | null;
}

function formatSpaceLabel(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	if (parts.length === 0) return path;
	return parts[parts.length - 1] ?? path;
}

function isSpaceContainerEntry(entry: FsEntry, spaceLabel: string): boolean {
	const normalizedSpaceLabel = spaceLabel.trim().toLocaleLowerCase();
	return (
		entry.kind === "dir" &&
		normalizedSpaceLabel.length > 0 &&
		entry.name.trim().toLocaleLowerCase() === normalizedSpaceLabel
	);
}

function folderEntries(entries: FsEntry[] | undefined): FsEntry[] {
	return (entries ?? []).filter((entry) => entry.kind === "dir");
}

function folioTreeRootEntries(
	rootEntries: FsEntry[],
	childrenByDir: Record<string, FsEntry[] | undefined>,
	spaceLabel: string,
): FsEntry[] {
	const spaceContainer = rootEntries.find((entry) =>
		isSpaceContainerEntry(entry, spaceLabel),
	);
	if (!spaceContainer) return folderEntries(rootEntries);
	return folderEntries([
		...rootEntries.filter((entry) => entry !== spaceContainer),
		...(childrenByDir[spaceContainer.rel_path] ?? []),
	]);
}

function AllNotesCountBadge() {
	const allDocsQuery = useQuery({
		queryKey: navigationQueryKeys.allDocsList(),
		queryFn: () => loadAllDocs(),
	});
	const count = allDocsQuery.data?.length ?? 0;
	if (count === 0) return null;
	return <span className="sidebarQuickActionCount">{count}</span>;
}

export const SidebarContent = memo(function SidebarContent({
	onToggleDir,
	onLoadDir,
	onExpandAllDirs,
	onCollapseAllDirs,
	onSelectDir,
	onOpenFile,
	onNewNote,
	onNewFileInDir,
	onCreateFromTemplateInDir,
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
	onOpenAllDocs,
	onOpenCommandPalette,
	spacePath,
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
		beautifulTags,
		tagAppearance,
		setTagAppearance,
	} = useFileTreeContext();
	const { folioMode, folioScope, setFolioScope } = useUILayoutContext();
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [pendingNewNotePath, setPendingNewNotePath] = useState<string | null>(
		null,
	);
	const [notesExpanded, setNotesExpanded] = useState(true);
	const newNoteShortcut = getBinding("new-note");
	const commandPaletteShortcut = getBinding("open-command-palette");
	const activeFolioFolder =
		folioScope.kind === "folder" ? folioScope.folderPrefix : null;
	const spaceLabel = spacePath ? formatSpaceLabel(spacePath) : "Glyph";
	const folioSpaceContainerPath = useMemo(() => {
		if (!folioMode) return null;
		return (
			rootEntries.find((entry) => isSpaceContainerEntry(entry, spaceLabel))
				?.rel_path ?? null
		);
	}, [folioMode, rootEntries, spaceLabel]);
	const folioRootEntries = useMemo(
		() => folioTreeRootEntries(rootEntries, childrenByDir, spaceLabel),
		[rootEntries, childrenByDir, spaceLabel],
	);
	const folioChildrenByDir = useMemo(() => {
		const next: Record<string, FsEntry[] | undefined> = {};
		for (const [dirPath, entries] of Object.entries(childrenByDir)) {
			next[dirPath] = entries ? folderEntries(entries) : entries;
		}
		return next;
	}, [childrenByDir]);
	useEffect(() => {
		if (!folioMode || !folioSpaceContainerPath) return;
		if (childrenByDir[folioSpaceContainerPath] !== undefined) return;
		void onLoadDir(folioSpaceContainerPath);
	}, [childrenByDir, folioMode, folioSpaceContainerPath, onLoadDir]);

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

	const handleChangeTagIcon = useCallback(
		async (tag: string, iconName: string | null) => {
			try {
				await setTagAppearance(tag, iconName);
			} catch (error) {
				toast.error("Could not update tag icon", {
					description: extractErrorMessage(error),
				});
				throw error;
			}
		},
		[setTagAppearance],
	);

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

	const handleOpenAllNotes = useCallback(() => {
		onOpenAllDocs();
		if (folioMode) {
			setFolioScope({ kind: "all" });
			onPrefetchAllDocs();
		}
	}, [folioMode, onOpenAllDocs, onPrefetchAllDocs, setFolioScope]);
	const handleNotesHeaderClick = useCallback(() => {
		setNotesExpanded((value) => !value);
		if (!folioMode) return;
		setFolioScope({ kind: "all" });
		onPrefetchAllDocs();
	}, [folioMode, onPrefetchAllDocs, setFolioScope]);
	const handleSelectFolioFolder = useCallback(
		(dirPath: string) => {
			onSelectDir(dirPath);
			if (!dirPath) {
				setFolioScope({ kind: "all" });
				return;
			}
			setFolioScope({ kind: "folder", folderPrefix: dirPath });
		},
		[onSelectDir, setFolioScope],
	);
	const handleSelectTag = useCallback(
		(tag: string) => {
			if (!folioMode) {
				onSelectTag(tag);
				return;
			}
			setFolioScope({ kind: "tag", tag });
		},
		[folioMode, onSelectTag, setFolioScope],
	);
	const handleSelectPerson = useCallback(
		(handle: string) => {
			if (!folioMode) {
				onSelectTag(handle);
				return;
			}
			setFolioScope({ kind: "person", handle });
		},
		[folioMode, onSelectTag, setFolioScope],
	);

	if (!spacePath) {
		return (
			<>
				<div className="sidebarSection sidebarSectionGrow sidebarEmpty">
					<div className="sidebarEmptyTitle">No space open</div>
					<div className="sidebarEmptyHint">
						Open or create a space to get started.
					</div>
				</div>
				<LicenseStatusFooter />
			</>
		);
	}

	return (
		<>
			<div className="sidebarSection sidebarSectionGrow">
				<div className="sidebarSectionContent">
					<div className="sidebarCommandSearch">
						<button
							type="button"
							className="sidebarCommandSearchButton"
							onClick={onOpenCommandPalette}
							aria-label="Open command palette"
							title={`Open command palette${
								commandPaletteShortcut
									? ` (${formatShortcutForPlatform(commandPaletteShortcut)})`
									: ""
							}`}
						>
							<HugeiconsIcon
								icon={SearchIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							<span className="sidebarCommandSearchPlaceholder">
								Quick Actions
							</span>
							{commandPaletteShortcut ? (
								<span className="sidebarCommandSearchShortcut">
									{formatShortcutForPlatform(commandPaletteShortcut)}
								</span>
							) : null}
						</button>
					</div>
					<div className="sidebarNavRow">
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="new-note"
							aria-label="New Note"
							onClick={onNewNote}
							title={`New Note${
								newNoteShortcut
									? ` (${formatShortcutForPlatform(newNoteShortcut)})`
									: ""
							}`}
						>
							<HugeiconsIcon
								icon={NoteIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							<span className="sidebarQuickActionLabel">New Note</span>
							{newNoteShortcut ? (
								<span className="sidebarQuickActionShortcut">
									{formatShortcutForPlatform(newNoteShortcut)}
								</span>
							) : null}
						</button>
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
							style={{ marginTop: 8 }}
						>
							<HugeiconsIcon
								icon={Home01Icon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							<span className="sidebarQuickActionLabel">Home</span>
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
							<HugeiconsIcon
								icon={LibraryIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							<span className="sidebarQuickActionLabel">Collections</span>
						</button>
						<button
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-kind="all-notes"
							data-active={activeTopSection === "all-notes" ? "true" : "false"}
							aria-label="All Notes"
							aria-pressed={activeTopSection === "all-notes"}
							aria-current={
								activeTopSection === "all-notes" ? "page" : undefined
							}
							onClick={handleOpenAllNotes}
							onMouseEnter={onPrefetchAllDocs}
							onFocus={onPrefetchAllDocs}
							title="Open All Notes"
						>
							<HugeiconsIcon
								icon={CollectionsBookmarkIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							<span className="sidebarQuickActionLabel">All Notes</span>
							<AllNotesCountBadge />
						</button>
					</div>
					<div className="sidebarStack">
						<section
							className="sidebarStackItem sidebarStackItemGrow"
							data-section="files"
						>
							<div className="sidebarStackHeader">
								<button
									type="button"
									className="sidebarStackHeaderToggle"
									onClick={handleNotesHeaderClick}
									aria-expanded={notesExpanded}
									aria-label={notesExpanded ? "Collapse Notes" : "Expand Notes"}
								>
									<span>Notes</span>
									{notesExpanded ? (
										<ChevronDown
											size="var(--icon-xs)"
											className="sidebarStackHeaderChevron"
										/>
									) : (
										<ChevronRight
											size="var(--icon-xs)"
											className="sidebarStackHeaderChevron"
										/>
									)}
								</button>
								<div className="sidebarStackHeaderActions">
									<button
										type="button"
										className="sidebarStackHeaderAction"
										title="Expand all folders"
										aria-label="Expand all folders"
										onClick={() => {
											void onExpandAllDirs();
										}}
									>
										<HugeiconsIcon
											icon={ExpandParagraphIcon}
											size="var(--icon-sm)"
											strokeWidth={0.9}
										/>
									</button>
									<button
										type="button"
										className="sidebarStackHeaderAction"
										title="Collapse all folders"
										aria-label="Collapse all folders"
										onClick={onCollapseAllDirs}
									>
										<HugeiconsIcon
											icon={ArrowShrinkIcon}
											size="var(--icon-sm)"
											strokeWidth={0.9}
										/>
									</button>
								</div>
							</div>
							{notesExpanded ? (
								<FileTreePane
									rootEntries={folioMode ? folioRootEntries : rootEntries}
									childrenByDir={folioMode ? folioChildrenByDir : childrenByDir}
									expandedDirs={expandedDirs}
									activeFilePath={folioMode ? null : activeFilePath}
									activeDirPath={folioMode ? activeFolioFolder : activeDirPath}
									onToggleDir={onToggleDir}
									onLoadDir={onLoadDir}
									onSelectDir={
										folioMode ? handleSelectFolioFolder : onSelectDir
									}
									onOpenFile={onOpenFile}
									onPrefetchFile={onPrefetchFile}
									onNewFileInDir={onNewFileInDir}
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDuplicateFile={onDuplicateFile}
									onDeletePath={onDeletePath}
									renamingPath={renamingPath}
									onStartRename={handleStartRename}
									onCancelRename={handleCancelRename}
									onCommitFileRename={handleCommitFileRename}
									onCommitDirRename={handleCommitDirRename}
									onMovePath={onMovePath}
									pinnedFiles={folioMode ? [] : pinnedFiles}
									onTogglePinnedFile={togglePinnedFile}
								/>
							) : null}
						</section>
						<section className="sidebarStackItem" data-section="tags">
							<TagsPane
								tags={tags}
								people={people}
								onSelectTag={handleSelectTag}
								onSelectPerson={handleSelectPerson}
								beautifulTags={beautifulTags}
								tagAppearance={tagAppearance}
								onChangeTagIcon={handleChangeTagIcon}
							/>
						</section>
					</div>
				</div>
			</div>
			<LicenseStatusFooter />
		</>
	);
});
