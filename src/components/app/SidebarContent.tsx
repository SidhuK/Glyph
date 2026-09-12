import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Archive04Icon,
	ArrowShrinkIcon,
	Calendar03Icon,
	CalendarAdd01Icon,
	ChartRelationshipIcon,
	ColorsIcon,
	CursorAddSelection02Icon,
	ExpandParagraphIcon,
	Folder01Icon,
	LibraryIcon,
	Link01Icon,
	NoteIcon,
	SearchIcon,
	Sorting01Icon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import {
	Activity,
	Children,
	type ComponentProps,
	type MouseEvent,
	type ReactNode,
	isValidElement,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useFileTreeSortMode } from "../../hooks/useFileTreeSortMode";
import { useHoverPrefetch } from "../../hooks/useHoverPrefetch";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { useWorkspaceTags } from "../../hooks/useWorkspaceTags";
import { FILE_TREE_START_RENAME_EVENT } from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { scheduleScrollFileTreePathIntoView } from "../../lib/fileTreeScroll";
import {
	FILE_TREE_SORT_MODES,
	fileTreeSortLabel,
} from "../../lib/fileTreeSort";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import {
	allDocsCountQueryOptions,
	formatAllDocsCountLabel,
} from "../../lib/navigationPrefetch";
import { type PeriodKind, isPeriodNoteEnabled } from "../../lib/periodNotes";
import { isFileTreeSortMode } from "../../lib/settings";
import type {
	SidebarOrder,
	SidebarVisibilityKey,
} from "../../lib/settings/model";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import type { FsEntry } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { basename, parentDir } from "../../utils/path";
import { TagsPane } from "../TagsPane";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import {
	getEditorTextColorOption,
	isEditorTextColor,
} from "../editor/textColors";
import { FileTreePane } from "../filetree";
import { SidebarPinnedItems } from "./SidebarPinnedItems";
import { SidebarWorkspaceHeader } from "./SidebarWorkspaceHeader";

export interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onLoadDir: (dirPath: string, force?: boolean) => Promise<void>;
	onExpandAllDirs: () => Promise<void>;
	onCollapseAllDirs: () => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	newNoteFolder: string;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onImportFilesInDir: (dirPath: string) => void;
	onImportFolderInDir: (dirPath: string) => void;
	onImportPathsInDir: (paths: string[], dirPath: string) => void;
	onRequestCreateFolder: (dirPath: string) => Promise<string | null>;
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
	onOpenDatabases: (databaseId?: string | null) => void;
	onPrefetchDatabases: (databaseId?: string | null) => void;
	onPrefetchAllDocs: () => void;
	onPrefetchFile: (relPath: string) => void;
	onOpenAllDocs: () => void;
	onOpenPinnedDocs: () => void;
	onOpenConnections: () => void;
	spacePath: string | null;
	activeTopSection:
		| "all-notes"
		| "connections"
		| "databases"
		| "pinned-notes"
		| null;
	onOpenCalendar: () => void;
	onOpenSearch: () => void;
	onOpenPeriodNote: (kind: PeriodKind) => void;
	onOpenQuickNote: () => void;
	onCreateFromTemplate: () => void;
	onGitSyncNow: () => void;
}

type SidebarView =
	| { kind: "files" }
	| { kind: "tags" }
	| { kind: "folder"; path: string };

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
	const { folderWorkspace } = useFileTreeContext();
	const countQuery = useQuery(allDocsCountQueryOptions(folderWorkspace.folder));
	const label = formatAllDocsCountLabel(countQuery.data ?? 0);
	if (!label) return null;
	return <span className="sidebarQuickActionCount">{label}</span>;
}

function SidebarActionButton({
	icon,
	kind,
	label,
	onClick,
	disabled,
	"data-sidebar-key": sidebarKey,
}: {
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
	kind: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	"data-sidebar-key"?: SidebarVisibilityKey;
}) {
	return (
		<button
			type="button"
			className="sidebarQuickActionBtn sidebarNavBtn"
			data-sidebar-key={sidebarKey}
			data-kind={kind}
			aria-label={label}
			onClick={onClick}
			disabled={disabled}
			title={label}
		>
			<HugeiconsIcon icon={icon} size="var(--icon-md)" />
			<span className="sidebarQuickActionLabel">{label}</span>
		</button>
	);
}

function OrderedSidebarItems({
	children,
	order,
}: {
	children: ReactNode;
	order: SidebarOrder;
}) {
	return Children.toArray(children).sort((left, right) => {
		if (
			!isValidElement<{ "data-sidebar-key": SidebarVisibilityKey }>(left) ||
			!isValidElement<{ "data-sidebar-key": SidebarVisibilityKey }>(right)
		)
			return 0;
		return (
			order.indexOf(left.props["data-sidebar-key"]) -
			order.indexOf(right.props["data-sidebar-key"])
		);
	});
}

export const SidebarContent = memo(function SidebarContent({
	onToggleDir,
	onLoadDir,
	onExpandAllDirs,
	onCollapseAllDirs,
	onSelectDir,
	onOpenFile,
	onNewNote,
	newNoteFolder,
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
	onSelectTag,
	onOpenDatabases,
	onPrefetchDatabases,
	onPrefetchAllDocs,
	onPrefetchFile,
	onOpenAllDocs,
	onOpenPinnedDocs,
	onOpenConnections,
	spacePath,
	activeTopSection,
	onOpenCalendar,
	onOpenSearch,
	onOpenPeriodNote,
	onOpenQuickNote,
	onCreateFromTemplate,
	onGitSyncNow,
}: SidebarContentProps) {
	const { t } = useTranslation("shell");
	// Contexts
	const { getBinding } = useShortcutBindings();
	const {
		rootEntries,
		childrenByDir,
		expandedDirs,
		activeDirPath,
		activeFilePath,
		folderWorkspace,
		pinnedFiles,
		togglePinnedFile,
		itemAppearance,
		sidebarFolderTabs,
		toggleSidebarFolderTab,
		tags,
		people,
		beautifulTags,
		tagAppearance,
		tagsError,
		ensureTagsFresh,
		setTagAppearance,
	} = useFileTreeContext();
	const {
		folioMode,
		periodNotesEnabled,
		sidebarOrder,
		setFolioScope,
		sidebarVisibility,
	} = useUILayoutContext();
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [pendingNewNotePath, setPendingNewNotePath] = useState<string | null>(
		null,
	);
	const [sidebarView, setSidebarView] = useState<SidebarView>({
		kind: "files",
	});
	const fileTreeSort = useFileTreeSortMode({
		onError: (message) => {
			toast.error("Could not update file tree sorting", {
				description: message,
			});
		},
	});
	const newNoteShortcut = getBinding("new-note");
	const searchShortcut =
		getBinding("open-command-palette") ?? getBinding("quick-open");
	const searchShortcutLabel = searchShortcut
		? formatShortcutForPlatform(searchShortcut)
		: "";
	const searchPlaceholder =
		t("sidebar.searchPlaceholder") !== "sidebar.searchPlaceholder"
			? t("sidebar.searchPlaceholder")
			: t("sidebar.search");
	const newNoteTitle = newNoteFolder
		? t("sidebar.newNoteInFolder", { folder: newNoteFolder })
		: t("sidebar.newNoteInRoot");
	const {
		cancelHoverPrefetch: cancelAllDocsHoverPrefetch,
		hoverPrefetchProps: allDocsHoverPrefetchProps,
	} = useHoverPrefetch(onPrefetchAllDocs);
	const {
		cancelHoverPrefetch: cancelDatabasesHoverPrefetch,
		hoverPrefetchProps: databasesHoverPrefetchProps,
	} = useHoverPrefetch(() => {
		onPrefetchDatabases();
	});
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
		return scheduleScrollFileTreePathIntoView(renamingPath, {
			warmupFrames: 2,
		});
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
			return renamed !== null;
		},
		[onRenameDir],
	);

	const handleCommitFileRename = useCallback(
		async (path: string, nextName: string) => {
			const renamed = await onRenameDir(path, nextName, "file");
			if (!renamed) return false;
			setRenamingPath(null);
			if (pendingNewNotePath === path) {
				onOpenFile(renamed);
				setPendingNewNotePath(null);
			}
			return true;
		},
		[onOpenFile, onRenameDir, pendingNewNotePath],
	);
	const showAllFolioDocs = useCallback(() => {
		if (!folioMode) return;
		setFolioScope({ kind: "all" });
		onPrefetchAllDocs();
	}, [folioMode, onPrefetchAllDocs, setFolioScope]);

	const handleOpenAllNotes = useCallback(() => {
		onOpenAllDocs();
		showAllFolioDocs();
	}, [onOpenAllDocs, showAllFolioDocs]);
	const activeSidebarView: SidebarView =
		sidebarView.kind === "tags"
			? sidebarView
			: folderWorkspace.folder
				? { kind: "folder", path: folderWorkspace.folder }
				: { kind: "files" };
	const activeFolderPath = folderWorkspace.folder;
	const workspaceTags = useWorkspaceTags(spacePath, activeFolderPath);
	const hadWorkspaceFocus = useRef(false);
	const workspacePanelRef = useCallback(
		(panel: HTMLElement | null) => {
			if (!panel) return;
			// Folder entry replaces the focused row; keep keyboard navigation in the tree.
			if (activeFolderPath || hadWorkspaceFocus.current)
				panel.focus({ preventScroll: true });
			hadWorkspaceFocus.current = Boolean(activeFolderPath);
		},
		[activeFolderPath],
	);
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
	const handleSidebarViewChange = useCallback(
		(view: "files" | "tags") => {
			setSidebarView({ kind: view });
			if (view === "tags") void ensureTagsFresh();
		},
		[ensureTagsFresh],
	);
	const handleSelectSidebarFolder = useCallback(
		(folderPath: string | null) => {
			folderWorkspace.enter(folderPath);
			setSidebarView({ kind: "files" });
			onSelectDir(folderPath ?? "");
			if (folioMode)
				setFolioScope(
					folderPath
						? { kind: "folder", folderPrefix: folderPath }
						: { kind: "all" },
				);
		},
		[folderWorkspace, onSelectDir, folioMode, setFolioScope],
	);
	const handleToggleSidebarFolderTab = useCallback(
		async (folderPath: string) => {
			const isRemoving = sidebarFolderTabs.includes(folderPath);
			try {
				await toggleSidebarFolderTab(folderPath);
				if (isRemoving && activeFolderPath === folderPath) {
					handleSidebarViewChange("files");
				}
			} catch (error) {
				toast.error(t("sidebar.folderTabUpdateFailed"), {
					description: extractErrorMessage(error),
				});
			}
		},
		[
			activeFolderPath,
			handleSidebarViewChange,
			sidebarFolderTabs,
			t,
			toggleSidebarFolderTab,
		],
	);
	const handleFolderTabContextMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>, folderPath: string) => {
			void showNativeContextMenu(event, [
				{
					label: t("sidebar.removeFolderTab", {
						folder: basename(folderPath),
					}),
					action: () => void handleToggleSidebarFolderTab(folderPath),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show folder tab context menu", error);
			});
		},
		[handleToggleSidebarFolderTab, t],
	);
	const handleSelectTag = useCallback(
		(tag: string) => {
			if (!folioMode || activeFolderPath) {
				onSelectTag(tag);
				return;
			}
			setFolioScope({ kind: "tag", tag });
		},
		[folioMode, activeFolderPath, onSelectTag, setFolioScope],
	);
	const handleSelectPerson = useCallback(
		(handle: string) => {
			if (!folioMode || activeFolderPath) {
				onSelectTag(handle);
				return;
			}
			setFolioScope({ kind: "person", handle });
		},
		[folioMode, activeFolderPath, onSelectTag, setFolioScope],
	);

	if (!spacePath) {
		return (
			<div className="sidebarSection sidebarSectionGrow sidebarEmpty">
				<div className="sidebarEmptyTitle">No space open</div>
				<div className="sidebarEmptyHint">
					Open or create a space to get started.
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="sidebarSection sidebarSectionGrow">
				<div className="sidebarSectionContent">
					<SidebarWorkspaceHeader
						spaceLabel={spaceLabel}
						onNavigate={handleSelectSidebarFolder}
					/>
					<div className="sidebarTopNavigation">
						<OrderedSidebarItems order={sidebarOrder}>
							{sidebarVisibility.newNote ? (
								<button
									key="newNote"
									type="button"
									className="sidebarQuickActionBtn sidebarNavBtn"
									data-sidebar-key="newNote"
									data-kind="new-note"
									aria-label={t("sidebar.newNote")}
									onClick={onNewNote}
									title={`${newNoteTitle}${
										newNoteShortcut
											? ` (${formatShortcutForPlatform(newNoteShortcut)})`
											: ""
									}`}
								>
									<HugeiconsIcon
										icon={CursorAddSelection02Icon}
										size="var(--icon-lg)"
									/>
									<span className="sidebarQuickActionLabel">
										{t("sidebar.newNote")}
									</span>
									{newNoteShortcut ? (
										<span className="sidebarQuickActionShortcut">
											{formatShortcutForPlatform(newNoteShortcut)}
										</span>
									) : null}
								</button>
							) : null}
							{sidebarVisibility.pinned ? (
								<SidebarPinnedItems
									key="pinned"
									data-sidebar-key="pinned"
									onOpenFile={onOpenFile}
									onOpenDatabase={onOpenDatabases}
									onShowAll={onOpenPinnedDocs}
								/>
							) : null}
							{sidebarVisibility.allNotes ? (
								<button
									key="allNotes"
									type="button"
									className="sidebarQuickActionBtn sidebarNavBtn"
									data-sidebar-key="allNotes"
									data-kind="all-notes"
									data-active={
										activeTopSection === "all-notes" ? "true" : "false"
									}
									aria-label={t("sidebar.allNotes")}
									aria-pressed={activeTopSection === "all-notes"}
									aria-current={
										activeTopSection === "all-notes" ? "page" : undefined
									}
									onClick={() => {
										cancelAllDocsHoverPrefetch();
										handleOpenAllNotes();
									}}
									{...allDocsHoverPrefetchProps}
									onFocus={onPrefetchAllDocs}
									title={t("sidebar.allNotes")}
								>
									<HugeiconsIcon icon={Archive04Icon} size="var(--icon-md)" />
									<span className="sidebarQuickActionLabel">
										{t("sidebar.allNotes")}
									</span>
									<AllNotesCountBadge />
								</button>
							) : null}
							{sidebarVisibility.databases && !activeFolderPath ? (
								<button
									key="databases"
									type="button"
									className="sidebarQuickActionBtn sidebarNavBtn"
									data-sidebar-key="databases"
									data-kind="databases"
									data-active={
										activeTopSection === "databases" ? "true" : "false"
									}
									aria-label={t("sidebar.collections")}
									aria-pressed={activeTopSection === "databases"}
									aria-current={
										activeTopSection === "databases" ? "page" : undefined
									}
									onClick={() => {
										cancelDatabasesHoverPrefetch();
										onOpenDatabases();
									}}
									{...databasesHoverPrefetchProps}
									onFocus={() => onPrefetchDatabases()}
									title={t("sidebar.collections")}
								>
									<HugeiconsIcon icon={LibraryIcon} size="var(--icon-md)" />
									<span className="sidebarQuickActionLabel">
										{t("sidebar.collections")}
									</span>
								</button>
							) : null}
							{sidebarVisibility.connections && !activeFolderPath ? (
								<button
									key="connections"
									type="button"
									className="sidebarQuickActionBtn sidebarNavBtn"
									data-sidebar-key="connections"
									data-kind="connections"
									data-active={
										activeTopSection === "connections" ? "true" : "false"
									}
									aria-label={t("sidebar.connections")}
									aria-pressed={activeTopSection === "connections"}
									aria-current={
										activeTopSection === "connections" ? "page" : undefined
									}
									onClick={onOpenConnections}
									title={t("sidebar.connections")}
								>
									<HugeiconsIcon
										icon={ChartRelationshipIcon}
										size="var(--icon-md)"
									/>
									<span className="sidebarQuickActionLabel">
										{t("sidebar.connections")}
									</span>
								</button>
							) : null}
							{sidebarVisibility.calendar && !activeFolderPath ? (
								<SidebarActionButton
									key="calendar"
									data-sidebar-key="calendar"
									kind="calendar"
									label={t("sidebar.calendar")}
									icon={Calendar03Icon}
									onClick={onOpenCalendar}
								/>
							) : null}
							{sidebarVisibility.search ? (
								<button
									key="search"
									type="button"
									className="sidebarSearchBar"
									data-sidebar-key="search"
									data-kind="search"
									aria-label={t("sidebar.search")}
									title={
										searchShortcutLabel
											? `${t("sidebar.search")} (${searchShortcutLabel})`
											: t("sidebar.search")
									}
									onClick={onOpenSearch}
								>
									<HugeiconsIcon
										icon={SearchIcon}
										size="var(--icon-sm)"
										className="sidebarSearchBarIcon"
										aria-hidden="true"
									/>
									<span className="sidebarSearchBarLabel">
										{searchPlaceholder}
									</span>
									{searchShortcutLabel ? (
										<span
											className="sidebarSearchBarShortcut"
											aria-hidden="true"
										>
											{searchShortcutLabel}
										</span>
									) : null}
								</button>
							) : null}
							{sidebarVisibility.quickNote && !activeFolderPath ? (
								<SidebarActionButton
									key="quickNote"
									data-sidebar-key="quickNote"
									kind="quick-note"
									label={t("sidebar.quickNote")}
									icon={NoteIcon}
									onClick={onOpenQuickNote}
								/>
							) : null}
							{sidebarVisibility.templates ? (
								<SidebarActionButton
									key="templates"
									data-sidebar-key="templates"
									kind="templates"
									label={t("sidebar.templates")}
									icon={ColorsIcon}
									onClick={() =>
										activeFolderPath
											? onCreateFromTemplateInDir(activeFolderPath)
											: onCreateFromTemplate()
									}
								/>
							) : null}
							{sidebarVisibility.gitSync ? (
								<SidebarActionButton
									key="gitSync"
									data-sidebar-key="gitSync"
									kind="git-sync"
									label={t("sidebar.gitSync")}
									icon={Link01Icon}
									onClick={onGitSyncNow}
								/>
							) : null}
							{sidebarVisibility.periodNotes && !activeFolderPath ? (
								<div
									key="periodNotes"
									className="sidebarNavRow"
									data-sidebar-key="periodNotes"
									data-section="period-notes"
								>
									<SidebarActionButton
										kind="daily-note"
										label={t("sidebar.dailyNote")}
										icon={CalendarAdd01Icon}
										onClick={() => onOpenPeriodNote("day")}
									/>
									{isPeriodNoteEnabled("week", periodNotesEnabled) ? (
										<SidebarActionButton
											kind="weekly-note"
											label={t("sidebar.weeklyNote")}
											icon={CalendarAdd01Icon}
											onClick={() => onOpenPeriodNote("week")}
										/>
									) : null}
									{isPeriodNoteEnabled("month", periodNotesEnabled) ? (
										<SidebarActionButton
											kind="monthly-note"
											label={t("sidebar.monthlyNote")}
											icon={CalendarAdd01Icon}
											onClick={() => onOpenPeriodNote("month")}
										/>
									) : null}
									{isPeriodNoteEnabled("quarter", periodNotesEnabled) ? (
										<SidebarActionButton
											kind="quarterly-note"
											label={t("sidebar.quarterlyNote")}
											icon={CalendarAdd01Icon}
											onClick={() => onOpenPeriodNote("quarter")}
										/>
									) : null}
								</div>
							) : null}
						</OrderedSidebarItems>
						<div
							className="sidebarViewTabs"
							role="tablist"
							aria-label={`${t("sidebar.files")} / ${t("tags.header")}`}
						>
							<button
								type="button"
								className="sidebarViewTab"
								id="sidebar-files-tab"
								role="tab"
								aria-selected={activeSidebarView.kind !== "tags"}
								aria-controls="sidebar-files-panel"
								onClick={() => handleSidebarViewChange("files")}
							>
								<HugeiconsIcon
									icon={Folder01Icon}
									size="var(--icon-md)"
									className="sidebarViewTabIcon"
									aria-hidden="true"
								/>
								<span className="sidebarViewTabLabel">
									{t("sidebar.files")}
								</span>
							</button>
							<button
								type="button"
								className="sidebarViewTab"
								id="sidebar-tags-tab"
								role="tab"
								aria-selected={activeSidebarView.kind === "tags"}
								aria-controls="sidebar-tags-panel"
								onClick={() => handleSidebarViewChange("tags")}
							>
								<HugeiconsIcon
									icon={Tag01Icon}
									size="var(--icon-md)"
									className="sidebarViewTabIcon"
									aria-hidden="true"
								/>
								<span className="sidebarViewTabLabel">{t("tags.header")}</span>
							</button>
							{sidebarFolderTabs.map((folderPath, index) => {
								const appearance = itemAppearance[folderPath];
								const customColor =
									appearance?.color && isEditorTextColor(appearance.color)
										? getEditorTextColorOption(appearance.color)
										: null;
								return (
									<button
										key={folderPath}
										type="button"
										className="sidebarViewTab sidebarViewFolderTab"
										style={
											customColor
												? {
														color: `var(${customColor.cssVar}, ${customColor.fallbackHex})`,
													}
												: undefined
										}
										id={`sidebar-folder-tab-${index + 1}`}
										role="tab"
										aria-label={t("sidebar.openFolderTab", {
											folder: folderPath,
										})}
										aria-selected={
											activeSidebarView.kind === "folder" &&
											activeSidebarView.path === folderPath
										}
										aria-controls="sidebar-files-panel"
										title={folderPath}
										onClick={() => handleSelectSidebarFolder(folderPath)}
										onContextMenu={(event) =>
											handleFolderTabContextMenu(event, folderPath)
										}
									>
										{appearance?.icon ? (
											<DatabaseColumnIcon
												iconName={appearance.icon}
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
										<span className="sidebarViewTabLabel">
											{basename(folderPath)}
										</span>
									</button>
								);
							})}
						</div>
					</div>
					<div className="sidebarViewContent">
						<Activity
							mode={activeSidebarView.kind === "tags" ? "hidden" : "visible"}
						>
							<section
								className="sidebarStackItem sidebarStackItemGrow sidebarViewPanel"
								key={activeFolderPath ?? "root"}
								ref={workspacePanelRef}
								tabIndex={-1}
								onKeyDown={(event) => {
									if (
										event.target === event.currentTarget &&
										event.key === "ArrowLeft" &&
										activeFolderPath
									) {
										event.preventDefault();
										handleSelectSidebarFolder(
											parentDir(activeFolderPath) || null,
										);
									}
								}}
								onScroll={(event) =>
									folderWorkspace.updateView({
										scroll: event.currentTarget.scrollTop,
									})
								}
								data-section="files"
								id="sidebar-files-panel"
								role="tabpanel"
								aria-labelledby="sidebar-files-tab"
							>
								<div className="sidebarStackHeader sidebarFileTreeToolbar">
									<h2 className="sidebarFileTreeToolbarTitle">
										{activeSidebarView.kind === "folder"
											? basename(activeSidebarView.path)
											: t("sidebar.files")}
									</h2>
									<div className="sidebarStackHeaderActions">
										<label className="sidebarStackHeaderSortNative">
											<span className="sr-only">{t("sidebar.sortNotes")}</span>
											<HugeiconsIcon
												icon={Sorting01Icon}
												size="var(--icon-sm)"
												className="sidebarStackHeaderSortIcon"
												aria-hidden="true"
											/>
											<select
												className="sidebarStackHeaderSortSelect"
												value={fileTreeSort.sortMode}
												title={`${t("sidebar.sortNotes")}: ${fileTreeSortLabel(fileTreeSort.sortMode)}`}
												aria-label={t("sidebar.sortNotes")}
												onChange={(event) => {
													const nextSortMode = event.currentTarget.value;
													if (!isFileTreeSortMode(nextSortMode)) return;
													void fileTreeSort.setSortMode(nextSortMode);
												}}
											>
												{FILE_TREE_SORT_MODES.map((mode) => (
													<option key={mode} value={mode}>
														{fileTreeSortLabel(mode)}
													</option>
												))}
											</select>
										</label>
										<button
											type="button"
											className="sidebarStackHeaderAction"
											title={t("sidebar.expandAllFolders")}
											aria-label={t("sidebar.expandAllFolders")}
											onClick={() => {
												void onExpandAllDirs();
											}}
										>
											<HugeiconsIcon
												icon={ExpandParagraphIcon}
												size="var(--icon-sm)"
											/>
										</button>
										<button
											type="button"
											className="sidebarStackHeaderAction"
											title={t("sidebar.collapseAllFolders")}
											aria-label={t("sidebar.collapseAllFolders")}
											onClick={onCollapseAllDirs}
										>
											<HugeiconsIcon
												icon={ArrowShrinkIcon}
												size="var(--icon-sm)"
											/>
										</button>
									</div>
								</div>
								{folderWorkspace.tree.error ? (
									<p className="sidebarWorkspaceHint" role="alert">
										{t("sidebar.workspace.filesFailed")}
									</p>
								) : null}
								<FileTreePane
									key={
										activeSidebarView.kind === "folder"
											? `folder:${activeSidebarView.path}`
											: "files"
									}
									rootEntries={folioMode ? folioRootEntries : rootEntries}
									childrenByDir={folioMode ? folioChildrenByDir : childrenByDir}
									expandedDirs={expandedDirs}
									activeFilePath={folioMode ? null : activeFilePath}
									activeDirPath={activeDirPath}
									onToggleDir={onToggleDir}
									onLoadDir={onLoadDir}
									onSelectDir={
										folioMode ? handleSelectFolioFolder : onSelectDir
									}
									onOpenFile={onOpenFile}
									onPrefetchFile={onPrefetchFile}
									onNewFileInDir={onNewFileInDir}
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onImportFilesInDir={onImportFilesInDir}
									onImportFolderInDir={onImportFolderInDir}
									onImportPathsInDir={onImportPathsInDir}
									onRequestCreateFolder={onRequestCreateFolder}
									onDuplicateFile={onDuplicateFile}
									onDeletePath={onDeletePath}
									renamingPath={renamingPath}
									onStartRename={handleStartRename}
									onCancelRename={handleCancelRename}
									onCommitFileRename={handleCommitFileRename}
									onCommitDirRename={handleCommitDirRename}
									onMovePath={onMovePath}
									sidebarFolderTabs={sidebarFolderTabs}
									onToggleSidebarFolderTab={handleToggleSidebarFolderTab}
									pinnedFiles={folioMode ? [] : pinnedFiles}
									onTogglePinnedFile={togglePinnedFile}
								/>
							</section>
						</Activity>
						<Activity
							mode={activeSidebarView.kind === "tags" ? "visible" : "hidden"}
						>
							<section
								className="sidebarStackItem sidebarStackItemGrow sidebarViewPanel"
								data-section="tags"
								id="sidebar-tags-panel"
								role="tabpanel"
								aria-labelledby="sidebar-tags-tab"
							>
								<TagsPane
									tags={
										activeFolderPath ? (workspaceTags.data?.tags ?? []) : tags
									}
									people={
										activeFolderPath
											? (workspaceTags.data?.people ?? [])
											: people
									}
									onSelectTag={handleSelectTag}
									onSelectPerson={handleSelectPerson}
									beautifulTags={beautifulTags}
									tagAppearance={tagAppearance}
									tagsError={
										activeFolderPath
											? workspaceTags.isError
												? t("sidebar.workspace.tagsFailed")
												: workspaceTags.isPending
													? t("sidebar.workspace.loading")
													: ""
											: tagsError
									}
									onChangeTagIcon={handleChangeTagIcon}
								/>
							</section>
						</Activity>
					</div>
				</div>
			</div>
		</>
	);
});
