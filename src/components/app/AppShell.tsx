import { cn } from "@/lib/utils";
import { join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";
import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	useAISidebarContext,
	useEditorContext,
	useFileTreeContext,
	useGitSyncContext,
	useSpace,
	useUILayoutContext,
	useUpdaterContext,
} from "../../contexts";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useDeeplinkDispatch } from "../../hooks/useDeeplinkDispatch";
import { useFileImport } from "../../hooks/useFileImport";
import { useFileTree } from "../../hooks/useFileTree";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { usePeriodNote } from "../../hooks/usePeriodNote";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { ACTIVITY_TIMELINE_TAB_ID } from "../../lib/activityTimeline";
import {
	dispatchEditorMenuAction,
	dispatchFileTreeStartRename,
} from "../../lib/appEvents";
import {
	INITIAL_DATABASES_OPEN_REQUEST,
	consumeCreateCollectionDialog,
	nextDatabasesOpenRequest,
} from "../../lib/database/openDatabasesRequest";
import { DATABASES_TAB_ID } from "../../lib/databases";
import {
	prefetchAllDocs,
	prefetchDatabasesLanding,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import {
	type PeriodKind,
	isPeriodNoteEnabled,
	periodIdFromDate,
	periodIdFromIsoDate,
} from "../../lib/periodNotes";
import { PINNED_DOCS_TAB_ID } from "../../lib/pinnedDocs";
import { buildPrintHtml } from "../../lib/printHtml";
import { requestSearchJump } from "../../lib/searchJump";
import { loadSettings } from "../../lib/settings";
import { getShortcutTooltip, toTauriAccelerator } from "../../lib/shortcuts";
import { useSpaceChangePropagation } from "../../lib/spaceChange";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { listTemplates, renderTemplate } from "../../lib/templates";
import { toast } from "../../lib/toast";
import {
	displayNameFromPath,
	isMarkdownPath,
	normalizeRelPath,
	parentDir,
} from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { dispatchAiContextAttach } from "../ai/aiContextEvents";
import {
	CalendarPaletteController,
	preloadCalendarPalette,
} from "./CalendarPaletteController";
import { IndexingNotice } from "./IndexingNotice";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";
import {
	TemplatePickerDialog,
	type TemplatePickerItem,
} from "./TemplatePickerDialog";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";
import {
	loadActivityTimelinePane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import { useAppCommands } from "./useAppCommands";
import { useTabManager } from "./useTabManager";
import { useWorkspaceLinkEvents } from "./useWorkspaceLinkEvents";
import { useWorkspaceSession } from "./useWorkspaceSession";

const loadCommandPalette = () =>
	import("./CommandPalette").then((module) => ({
		default: module.CommandPalette,
	}));

const LazyCommandPalette = lazy(loadCommandPalette);

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_AUTO_COLLAPSE_WIDTH = 760;
const GIT_SYNC_ERROR_TOAST_ID = "glyph-git-sync-error";

function showGitSyncErrorToast(message: string) {
	toast.error("Git Sync failed", {
		description: message,
		id: GIT_SYNC_ERROR_TOAST_ID,
	});
}

export function AppShell() {
	const { t } = useTranslation("shell");
	const space = useSpace();
	const {
		spacePath,
		setError,
		onOpenSpace: openSpace,
		onOpenSpaceAtPath: openSpaceAtPath,
		onCreateSpace: createSpace,
		closeSpace,
		welcomeNotePath,
		consumeWelcomeNotePath,
		isIndexing,
		settingsLoaded,
	} = space;
	const fileTreeCtx = useFileTreeContext();
	const {
		rootEntries,
		childrenByDir,
		expandedDirs,
		activeDirPath,
		setActiveDirPath,
		activeFilePath,
		pinnedFiles,
		togglePinnedFile,
		renamePinnedPath,
		deletePinnedPath,
		renameItemAppearance,
		deleteItemAppearance,
		updateRootEntries,
		updateChildrenByDir,
		updateExpandedDirs,
		setActiveFilePath,
		refreshTags,
	} = fileTreeCtx;
	const {
		sidebarCollapsed: sidebarCollapsedState,
		setSidebarCollapsed: setSidebarCollapsedState,
		folioMode,
		paletteOpen,
		setPaletteOpen,
		openMarkdownTabs,
		activeMarkdownTabPath,
		dailyNotesFolder,
		defaultNewNoteFolder,
		templateFolder,
		periodNoteTemplates,
		periodNotesEnabled,
		settingsSpacePath,
		sidebarWidth,
		setSidebarWidth,
		settingsMode,
		zenMode,
		openSettings,
		closeSettings,
	} = useUILayoutContext();
	const zenModeRef = useRef(zenMode);
	zenModeRef.current = zenMode;
	const { aiEnabled, setAiPanelOpen } = useAISidebarContext();
	const {
		getCurrentMarkdown,
		saveCurrentEditor,
		saveAllEditors,
		setCurrentEditorMode,
	} = useEditorContext();

	const [paletteLaunchMode, setPaletteLaunchMode] = useState<
		"commands" | "search"
	>("commands");
	const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
	const [databasesOpenRequest, setDatabasesOpenRequest] = useState(
		INITIAL_DATABASES_OPEN_REQUEST,
	);
	const [dailyNoteSetupNoticeRequest, setDailyNoteSetupNoticeRequest] =
		useState(0);
	const [movePickerSourcePath, setMovePickerSourcePath] = useState<
		string | null
	>(null);
	const [moveTargetDirs, setMoveTargetDirs] = useState<string[]>([]);
	const [commandPaletteMounted, setCommandPaletteMounted] = useState(false);
	const [calendarOpen, setCalendarOpen] = useState(false);
	const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
	const [templatePickerDirPath, setTemplatePickerDirPath] = useState("");
	const [templatePickerItems, setTemplatePickerItems] = useState<
		TemplatePickerItem[]
	>([]);
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showCollapsibleLists, setShowCollapsibleLists] = useState(false);
	const [noteSidePeekEnabled, setNoteSidePeekEnabled] = useState(false);
	const [notePeek, setNotePeek] = useState<{
		spacePath: string;
		relPath: string;
	} | null>(null);
	const [resumeLastSession, setResumeLastSession] = useState<boolean | null>(
		null,
	);
	const [commandPaletteSessionId, setCommandPaletteSessionId] = useState(0);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
	const autoUpdater = useUpdaterContext();
	const [sidebarAutoCollapsed, setSidebarAutoCollapsed] = useState(() =>
		typeof window === "undefined"
			? false
			: window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_WIDTH,
	);

	const sidebarCollapsed = sidebarCollapsedState || sidebarAutoCollapsed;
	const setSidebarCollapsed = useCallback(
		(collapsed: boolean) => {
			if (!collapsed && sidebarAutoCollapsed) return;
			setSidebarCollapsedState(collapsed);
		},
		[setSidebarCollapsedState, sidebarAutoCollapsed],
	);
	const gitSync = useGitSyncContext();
	const lastGitSyncStatusRef = useRef<{
		isSyncing: boolean;
		phase: string;
		lastError: string | null;
		message: string | null;
	} | null>(null);

	const sidebarResize = useResizablePanel({
		min: SIDEBAR_MIN_WIDTH,
		max: SIDEBAR_MAX_WIDTH,
		disabled: sidebarCollapsed,
		direction: "right",
		onResize: setSidebarWidth,
		currentWidth: sidebarWidth,
	});

	useEffect(() => {
		const query = window.matchMedia(
			`(max-width: ${SIDEBAR_AUTO_COLLAPSE_WIDTH}px)`,
		);
		const syncSidebarBreakpoint = () => {
			setSidebarAutoCollapsed(query.matches);
			if (query.matches) {
				setSidebarCollapsedState(true);
			}
		};

		syncSidebarBreakpoint();
		query.addEventListener("change", syncSidebarBreakpoint);
		return () => {
			query.removeEventListener("change", syncSidebarBreakpoint);
		};
	}, [setSidebarCollapsedState]);

	useEffect(() => {
		let cancelled = false;
		const idle = window.setTimeout(() => {
			void loadCommandPalette().then(() => {
				if (!cancelled) setCommandPaletteMounted(true);
			});
			preloadCalendarPalette();
		}, 500);
		return () => {
			cancelled = true;
			window.clearTimeout(idle);
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				setShowCollapsibleLists(settings.editor.showCollapsibleLists);
				setNoteSidePeekEnabled(settings.ui.noteSidePeek);
				setResumeLastSession(settings.ui.resumeLastSession);
			})
			.catch((error) => {
				console.error("Failed to load workspace display settings", error);
				if (!cancelled) setResumeLastSession(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload: {
				editor?: {
					showCollapsibleHeadings?: boolean;
					showCollapsibleLists?: boolean;
					zenMode?: boolean;
				};
				ui?: {
					noteSidePeek?: boolean;
					resumeLastSession?: boolean;
				};
			}) => {
				if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
					setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
				}
				if (typeof payload.editor?.showCollapsibleLists === "boolean") {
					setShowCollapsibleLists(payload.editor.showCollapsibleLists);
				}
				if (payload.editor?.zenMode) {
					setPaletteOpen(false);
					setCalendarOpen(false);
					setTemplatePickerOpen(false);
				}
				if (typeof payload.ui?.noteSidePeek === "boolean") {
					setNoteSidePeekEnabled(payload.ui.noteSidePeek);
					if (!payload.ui.noteSidePeek) setNotePeek(null);
				}
				if (typeof payload.ui?.resumeLastSession === "boolean") {
					setResumeLastSession(payload.ui.resumeLastSession);
				}
			},
			[setPaletteOpen],
		),
	);

	useEffect(() => {
		const status = gitSync.status;
		const previous = lastGitSyncStatusRef.current;

		if (previous?.isSyncing && status && !status.is_syncing) {
			if (status.phase === "success") {
				toast.success("Git Sync completed.");
			} else if (status.phase === "error" || status.last_error) {
				const message =
					status.last_error ?? status.message ?? "Git Sync failed.";
				showGitSyncErrorToast(message);
			}
		}

		lastGitSyncStatusRef.current = status
			? {
					isSyncing: status.is_syncing,
					phase: status.phase,
					lastError: status.last_error,
					message: status.message,
				}
			: null;
	}, [gitSync.status]);

	const fileTree = useFileTree({
		spacePath,
		expandedDirs,
		updateChildrenByDir,
		updateExpandedDirs,
		updateRootEntries,
		renameItemAppearance,
		deleteItemAppearance,
		setActiveFilePath,
		setActiveDirPath,
		activeFilePath,
		setError,
	});

	const {
		tabs,
		panes,
		splitLayout,
		focusedPaneId,
		activeTab,
		activeTabPath,
		setActiveTabId,
		focusPane,
		setDirtyByPath,
		toggleTabPinned,
		toggleActiveTabPinned,
		closeTab,
		closeAllTabs,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openBlankTab,
		openBlankTabInPane,
		openFileInPane,
		splitPaneWithFile,
		splitPaneWithBlank,
		moveTabToPane,
		resizeSplit,
		openFileTab,
		openSpecialTab,
		restoreWorkspaceTabs,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		goBackInPane,
		goForwardInPane,
		activateNextTab,
		activatePreviousTab,
		activateTabByIndex,
		tabsRevision,
	} = useTabManager(spacePath);
	const { getBinding, actionsWithBindings } = useShortcutBindings();
	const flushWorkspaceSession = useWorkspaceSession({
		spacePath,
		settingsLoaded,
		resumeLastSession,
		welcomeNotePath,
		tabs,
		panes,
		splitLayout,
		focusedPaneId,
		activeTabPath,
		tabsRevision,
		restoreWorkspaceTabs,
	});

	const prepareForSpaceChange = useCallback(async (): Promise<boolean> => {
		try {
			await saveAllEditors();
			await flushWorkspaceSession();
			return true;
		} catch (cause) {
			console.error("Failed to save the current space before switching", cause);
			setError(t("workspace.switchSaveFailed"));
			return false;
		}
	}, [flushWorkspaceSession, saveAllEditors, setError, t]);

	const handleOpenSpace = useCallback(async () => {
		if (spacePath && !(await prepareForSpaceChange())) return;
		await openSpace();
	}, [openSpace, prepareForSpaceChange, spacePath]);

	const handleCreateSpace = useCallback(async () => {
		if (spacePath && !(await prepareForSpaceChange())) return;
		await createSpace();
	}, [createSpace, prepareForSpaceChange, spacePath]);

	const handleSelectSpace = useCallback(
		async (path: string): Promise<boolean> => {
			if (path === spacePath) return true;
			if (!(await prepareForSpaceChange())) return false;
			return await openSpaceAtPath(path);
		},
		[openSpaceAtPath, prepareForSpaceChange, spacePath],
	);

	const handleCloseSpace = useCallback(async () => {
		if (!(await prepareForSpaceChange())) return;
		await closeSpace();
	}, [closeSpace, prepareForSpaceChange]);

	useEffect(() => {
		const visible =
			activeMarkdownTabPath !== null && isMarkdownPath(activeMarkdownTabPath);
		void invoke("set_markdown_menu_visible", { visible }).catch(() => {});
	}, [activeMarkdownTabPath]);

	useEffect(() => {
		const settingsReady = settingsSpacePath === spacePath;
		void invoke("set_period_note_menu_enabled", {
			weekly: settingsReady && periodNotesEnabled.week,
			monthly: settingsReady && periodNotesEnabled.month,
			quarterly: settingsReady && periodNotesEnabled.quarter,
		}).catch(() => {});
	}, [periodNotesEnabled, settingsSpacePath, spacePath]);

	const spacePathRef = useRef(spacePath);
	useLayoutEffect(() => {
		spacePathRef.current = spacePath;
	}, [spacePath]);

	const [peekNavigation, setPeekNavigation] = useState({
		spacePath,
		activeTabPath,
	});
	if (
		spacePath !== peekNavigation.spacePath ||
		activeTabPath !== peekNavigation.activeTabPath
	) {
		setPeekNavigation({ spacePath, activeTabPath });
		if (notePeek) setNotePeek(null);
	}

	const closeNotePeek = useCallback(() => {
		setNotePeek(null);
	}, []);
	const openWorkspaceFile = useCallback(
		async (path: string) => {
			if (!path) return;
			closeNotePeek();
			if (isMarkdownPath(path)) {
				setActiveDirPath(parentDir(path));
				openFileTab(path);
				return;
			}
			await fileTree.openFile(path);
		},
		[closeNotePeek, fileTree, openFileTab, setActiveDirPath],
	);
	const openBrowseNote = useCallback(
		async (path: string) => {
			if (!path) return;
			const browseSpacePath = spacePath;
			if (noteSidePeekEnabled && browseSpacePath && isMarkdownPath(path)) {
				prefetchNote(path);
				if (spacePathRef.current !== browseSpacePath) return;
				setNotePeek({ spacePath: browseSpacePath, relPath: path });
				return;
			}
			await openWorkspaceFile(path);
		},
		[noteSidePeekEnabled, openWorkspaceFile, spacePath],
	);
	const openPeekedNote = useCallback(async () => {
		if (!notePeek) return;
		await openWorkspaceFile(notePeek.relPath);
	}, [notePeek, openWorkspaceFile]);
	const { importFilesInto, importFolderInto, importPathsInto } = useFileImport({
		loadDir: fileTree.loadDir,
		openWorkspaceFile,
	});
	const selectedImportDir =
		activeDirPath ?? (activeFilePath ? parentDir(activeFilePath) : "");
	const handleImportFilesFromMenu = useCallback(() => {
		void importFilesInto(selectedImportDir);
	}, [importFilesInto, selectedImportDir]);
	const handleImportFolderFromMenu = useCallback(() => {
		void importFolderInto(selectedImportDir);
	}, [importFolderInto, selectedImportDir]);

	useEffect(() => {
		if (!spacePath || !welcomeNotePath) return;
		void openWorkspaceFile(welcomeNotePath)
			.then(consumeWelcomeNotePath)
			.catch((cause) => {
				setError(cause instanceof Error ? cause.message : String(cause));
			});
	}, [
		consumeWelcomeNotePath,
		openWorkspaceFile,
		setError,
		spacePath,
		welcomeNotePath,
	]);

	const openFolioWorkspaceFile = useCallback(
		async (path: string) => {
			if (!path) return;
			closeNotePeek();
			if (!isMarkdownPath(path)) {
				await fileTree.openFile(path);
				return;
			}
			setActiveDirPath(parentDir(path));
			openFileTab(path);
		},
		[closeNotePeek, fileTree, openFileTab, setActiveDirPath],
	);

	const openWorkspaceFileInNewTab = useCallback(
		async (path: string) => {
			if (!path) return;
			if (!isMarkdownPath(path)) {
				await openWorkspaceFile(path);
				return;
			}
			const existingTab = tabs.find((tab) => tab.target === path);
			if (existingTab) {
				await openWorkspaceFile(path);
				return;
			}
			openBlankTab();
			await openWorkspaceFile(path);
		},
		[openBlankTab, openWorkspaceFile, tabs],
	);

	const openFolioWorkspaceFileInNewTab = useCallback(
		async (path: string) => {
			if (!path) return;
			if (!isMarkdownPath(path)) {
				await openFolioWorkspaceFile(path);
				return;
			}
			const existingTab = tabs.find((tab) => tab.target === path);
			if (existingTab) {
				await openFolioWorkspaceFile(path);
				return;
			}
			openBlankTab();
			await openFolioWorkspaceFile(path);
		},
		[openBlankTab, openFolioWorkspaceFile, tabs],
	);

	const openQuickNoteWindow = useCallback(() => {
		void invoke("show_quick_note_window").catch((cause) => {
			const message = cause instanceof Error ? cause.message : String(cause);
			setError(message);
		});
	}, [setError]);

	useTauriEvent("app:open_note", (payload) => {
		void openWorkspaceFile(payload.path).catch((cause) => {
			console.error("Failed to open note requested by another window", cause);
			const message = cause instanceof Error ? cause.message : String(cause);
			toast.error("Could not open note", { description: message });
		});
	});

	const templatePathForPeriod = useCallback(
		(period: { kind: PeriodKind }) => periodNoteTemplates[period.kind],
		[periodNoteTemplates],
	);

	const { openOrCreatePeriodNote } = usePeriodNote({
		onOpenFile: (path) => openWorkspaceFile(path),
		setError,
		spacePath,
		templatePathFor: templatePathForPeriod,
	});

	const openTemplatesSettings = useCallback(() => {
		openSettings("space");
	}, [openSettings]);

	const openTemplatePicker = useCallback(
		async (dirPath?: string) => {
			if (zenModeRef.current) return;
			if (!spacePath) return;
			if (templateFolder === null) {
				setError("Set a template folder in Settings -> Space first.");
				openTemplatesSettings();
				return;
			}
			try {
				const templates = await listTemplates(templateFolder);
				if (zenModeRef.current) return;
				if (!templates.length) {
					setError("No markdown templates were found in the template folder.");
					openTemplatesSettings();
					return;
				}
				setTemplatePickerItems(
					templates.map((template) => ({
						relPath: template.relPath,
						label: template.relPath.startsWith(`${templateFolder}/`)
							? template.relPath.slice(templateFolder.length + 1)
							: template.relPath,
					})),
				);
				setTemplatePickerDirPath(dirPath ?? "");
				setTemplatePickerOpen(true);
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "Failed to load the template library.",
				);
			}
		},
		[openTemplatesSettings, setError, spacePath, templateFolder],
	);

	const handlePickTemplate = useCallback(
		async (
			template: TemplatePickerItem,
			destinationDirPath = templatePickerDirPath,
		) => {
			if (!spacePath) return;
			setTemplatePickerOpen(false);
			try {
				const { save } = await import("@tauri-apps/plugin-dialog");
				const suggestedFileName =
					template.relPath.split("/").pop()?.trim() || "Untitled.md";
				const defaultPath = destinationDirPath
					? await join(spacePath, destinationDirPath, suggestedFileName)
					: await join(spacePath, suggestedFileName);
				const selection = await save({
					title: "Create note from template",
					defaultPath,
					filters: [{ name: "Markdown", extensions: ["md"] }],
				});
				const absPath = Array.isArray(selection)
					? (selection[0] ?? null)
					: selection;
				if (!absPath) return;
				const relPath = await invoke("space_relativize_path", {
					abs_path: absPath,
				});
				const normalizedRelPath = relPath.toLowerCase().endsWith(".md")
					? relPath
					: `${relPath}.md`;
				if (
					destinationDirPath &&
					normalizedRelPath !== destinationDirPath &&
					!normalizedRelPath.startsWith(`${destinationDirPath}/`)
				) {
					setError(`Choose a file path inside "${destinationDirPath}"`);
					return;
				}
				const templateDoc = await invoke("space_read_text", {
					path: template.relPath,
				});
				const rendered = renderTemplate(templateDoc.text, {
					destinationPath: normalizedRelPath,
					spaceRootPath: spacePath,
				});
				const createdPath = await fileTree.createMarkdownFileAtPath({
					path: normalizedRelPath,
					text: rendered,
					openParentDir: destinationDirPath,
				});
				if (createdPath) {
					await openWorkspaceFile(createdPath);
				}
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "Failed to create the note from template.",
				);
			}
		},
		[fileTree, openWorkspaceFile, setError, spacePath, templatePickerDirPath],
	);

	const handleOpenPeriodNote = useCallback(
		async (kind: PeriodKind) => {
			if (!dailyNotesFolder) return;
			await openOrCreatePeriodNote(
				dailyNotesFolder,
				periodIdFromDate(kind, new Date()),
			);
		},
		[dailyNotesFolder, openOrCreatePeriodNote],
	);

	const requestOpenPeriodNote = useCallback(
		(kind: PeriodKind) => {
			if (!spacePath) return;
			if (!isPeriodNoteEnabled(kind, periodNotesEnabled)) return;
			if (!dailyNotesFolder) {
				setDailyNoteSetupNoticeRequest((value) => value + 1);
				return;
			}
			void handleOpenPeriodNote(kind);
		},
		[dailyNotesFolder, handleOpenPeriodNote, periodNotesEnabled, spacePath],
	);

	const requestOpenDailyNote = useCallback(() => {
		requestOpenPeriodNote("day");
	}, [requestOpenPeriodNote]);

	const openCalendar = useCallback(() => {
		if (zenModeRef.current) return;
		if (!spacePath) return;
		setCalendarOpen(true);
	}, [spacePath]);

	const closeCalendar = useCallback(() => {
		setCalendarOpen(false);
	}, []);

	const handleOpenPeriodNoteAtDate = useCallback(
		async (kind: PeriodKind, date: string) => {
			if (!isPeriodNoteEnabled(kind, periodNotesEnabled)) return;
			if (!dailyNotesFolder) {
				setDailyNoteSetupNoticeRequest((value) => value + 1);
				return;
			}
			const period = periodIdFromIsoDate(kind, date);
			if (!period) {
				setError("Failed to open dated note: invalid date");
				return;
			}
			await openOrCreatePeriodNote(dailyNotesFolder, period);
		},
		[dailyNotesFolder, openOrCreatePeriodNote, periodNotesEnabled, setError],
	);

	const moveTargetDirsRequestIdRef = useRef(0);

	const openPalette = useCallback(
		(mode: "commands" | "search", query = "") => {
			if (zenModeRef.current) return;
			setPaletteLaunchMode(mode);
			setPaletteInitialQuery(query);
			setCommandPaletteSessionId((value) => value + 1);
			setCommandPaletteMounted(true);
			setPaletteOpen(true);
		},
		[setPaletteOpen],
	);

	useDeeplinkDispatch({
		spacePath,
		settingsSpacePath,
		settingsLoaded,
		selectSpace: handleSelectSpace,
		openWorkspaceFile,
		openPalette,
		requestOpenDailyNote,
	});

	const closePalette = useCallback(() => {
		moveTargetDirsRequestIdRef.current += 1;
		setPaletteOpen(false);
		setMovePickerSourcePath(null);
		setMoveTargetDirs([]);
	}, [setPaletteOpen]);
	const refreshMoveTargetDirs = useCallback(async (sourcePath: string) => {
		const requestId = ++moveTargetDirsRequestIdRef.current;
		setMoveTargetDirs([]);
		try {
			const entries = await invoke("space_list_dir", {
				recursive: true,
				directories_only: true,
				limit: 5000,
			});
			if (moveTargetDirsRequestIdRef.current !== requestId) return;
			const fromDir = parentDir(sourcePath);
			setMoveTargetDirs(
				entries
					.map((entry) => entry.rel_path)
					.filter((dir) => dir !== fromDir)
					.sort((left, right) => left.localeCompare(right)),
			);
		} catch {
			if (moveTargetDirsRequestIdRef.current === requestId) {
				setMoveTargetDirs([]);
			}
		}
	}, []);

	useWorkspaceLinkEvents({
		activeMarkdownTabPath,
		fileTree,
		noteSidePeekEnabled,
		openPalette,
		openWorkspaceFile,
		openBrowseNote,
		setError,
	});

	const openTagSearchPalette = useCallback(
		(tag: string) => {
			const query =
				tag.startsWith("#") || tag.startsWith("@") ? tag : `#${tag}`;
			openPalette("search", query);
		},
		[openPalette],
	);

	const attachContextFiles = useCallback(
		async (paths: string[]) => {
			if (!aiEnabled) return;
			const unique = Array.from(
				new Set(
					paths
						.map((p) => p.trim())
						.filter((p) => p.toLowerCase().endsWith(".md")),
				),
			);
			if (!unique.length) return;
			setAiPanelOpen(true);
			window.setTimeout(() => dispatchAiContextAttach({ paths: unique }), 0);
		},
		[aiEnabled, setAiPanelOpen],
	);

	const attachCurrentNoteToAi = useCallback(async () => {
		if (!activeMarkdownTabPath) {
			setError("No open markdown note to attach to AI.");
			return;
		}
		await attachContextFiles([activeMarkdownTabPath]);
	}, [activeMarkdownTabPath, attachContextFiles, setError]);

	const attachAllOpenNotesToAi = useCallback(async () => {
		const tabs = openMarkdownTabs.filter((p) =>
			p.toLowerCase().endsWith(".md"),
		);
		if (!tabs.length) {
			setError("No open markdown notes to attach to AI.");
			return;
		}
		await attachContextFiles(tabs);
	}, [attachContextFiles, openMarkdownTabs, setError]);

	const newNoteFolder =
		settingsSpacePath === spacePath && defaultNewNoteFolder
			? defaultNewNoteFolder
			: (activeDirPath ?? (activeFilePath ? parentDir(activeFilePath) : ""));

	const createNoteInSelectedFolder = useCallback(async () => {
		if (!spacePath) return null;
		return fileTree.onNewFileInDir(newNoteFolder);
	}, [fileTree, newNoteFolder, spacePath]);

	const handleNewNoteFromMenu = useCallback(() => {
		if (!spacePath) return;
		void createNoteInSelectedFolder();
	}, [createNoteInSelectedFolder, spacePath]);

	const handleCreateFromTemplateFromMenu = useCallback(() => {
		if (!spacePath) return;
		const dir =
			activeDirPath ?? (activeFilePath ? parentDir(activeFilePath) : "");
		void openTemplatePicker(dir);
	}, [activeDirPath, activeFilePath, openTemplatePicker, spacePath]);

	const handleOpenPeriodNoteFromMenu = useCallback(
		(kind: PeriodKind) => {
			requestOpenPeriodNote(kind);
		},
		[requestOpenPeriodNote],
	);

	const handleSaveNoteFromMenu = useCallback(() => {
		if (!spacePath) return;
		void saveCurrentEditor();
	}, [saveCurrentEditor, spacePath]);

	const handleRevealSpaceFromMenu = useCallback(() => {
		if (!spacePath) return;
		void openPath(spacePath);
	}, [spacePath]);

	const handleOpenSpaceSettings = useCallback(() => {
		openSettings("space");
	}, [openSettings]);

	const handleToggleAiPaneFromMenu = useCallback(() => {
		if (!spacePath || !aiEnabled) return;
		setAiPanelOpen((v) => !v);
	}, [aiEnabled, setAiPanelOpen, spacePath]);

	const handleAttachCurrentNoteFromMenu = useCallback(() => {
		void attachCurrentNoteToAi();
	}, [attachCurrentNoteToAi]);

	const handleAttachAllOpenNotesFromMenu = useCallback(() => {
		void attachAllOpenNotesToAi();
	}, [attachAllOpenNotesToAi]);

	const handleOpenAiSettings = useCallback(() => {
		openSettings("ai");
	}, [openSettings]);

	const spaceChangeHost = useMemo(
		() => ({
			spacePath,
			expandedDirs,
			loadDir: fileTree.loadDir,
			closeTabsForPathRemoval,
			renameTabsForPath,
			renamePinnedPath,
			deletePinnedPath,
			refreshTags,
		}),
		[
			spacePath,
			expandedDirs,
			fileTree.loadDir,
			closeTabsForPathRemoval,
			renameTabsForPath,
			renamePinnedPath,
			deletePinnedPath,
			refreshTags,
		],
	);
	useSpaceChangePropagation(spaceChangeHost);

	const activeTopSection = useMemo<
		"all-notes" | "connections" | "databases" | "pinned-notes" | null
	>(() => {
		if (activeTabPath === ACTIVITY_TIMELINE_TAB_ID) return "all-notes";
		if (activeTabPath === SPACE_CONNECTIONS_TAB_ID) return "connections";
		if (activeTabPath === DATABASES_TAB_ID) return "databases";
		if (activeTabPath === PINNED_DOCS_TAB_ID) return "pinned-notes";
		return null;
	}, [activeTabPath]);
	const openCommandPalette = useCallback(() => {
		openPalette("commands");
	}, [openPalette]);
	const openSearchPalette = useCallback(() => {
		if (!spacePath) {
			openCommandPalette();
			return;
		}
		openPalette("search");
	}, [openCommandPalette, openPalette, spacePath]);
	const openAllDocsTab = useCallback(() => {
		openSpecialTab(ACTIVITY_TIMELINE_TAB_ID);
	}, [openSpecialTab]);
	const openPinnedDocsTab = useCallback(() => {
		openSpecialTab(PINNED_DOCS_TAB_ID);
	}, [openSpecialTab]);
	const openDatabasesTab = useCallback(
		(databaseId?: string | null, options?: { openCreateDialog?: boolean }) => {
			setDatabasesOpenRequest((current) =>
				nextDatabasesOpenRequest(current, {
					databaseId: databaseId ?? null,
					openCreateDialog: options?.openCreateDialog ?? false,
					paneId: focusedPaneId,
				}),
			);
			openSpecialTab(DATABASES_TAB_ID);
		},
		[focusedPaneId, openSpecialTab],
	);
	const openConnectionsView = useCallback(() => {
		openSpecialTab(SPACE_CONNECTIONS_TAB_ID);
	}, [openSpecialTab]);
	const createDatabaseAndOpen = useCallback(() => {
		openDatabasesTab(null, { openCreateDialog: true });
	}, [openDatabasesTab]);
	const consumeDatabasesOpenRequest = useCallback(() => {
		setDatabasesOpenRequest((current) =>
			consumeCreateCollectionDialog(current),
		);
	}, []);
	const prefetchWorkspaceFile = useCallback((path: string) => {
		if (!isMarkdownPath(path)) return;
		prefetchNote(path);
	}, []);
	const prefetchDatabasesTab = useCallback((databaseId?: string | null) => {
		void loadDatabasesPane();
		void prefetchDatabasesLanding(databaseId);
	}, []);
	const prefetchAllDocsTab = useCallback(() => {
		void loadActivityTimelinePane();
		void prefetchAllDocs(null);
	}, []);

	const handleCopyOpenNoteAsMarkdown = useCallback(async () => {
		if (!activeMarkdownTabPath) return;

		try {
			const markdown =
				getCurrentMarkdown(activeMarkdownTabPath) ??
				(
					await invoke("space_read_text", {
						path: activeMarkdownTabPath,
					})
				).text;
			await navigator.clipboard.writeText(markdown);
			toast.success("Copied note as Markdown.");
		} catch (error) {
			console.error("Failed to copy note as markdown", error);
			toast.error("Could not copy note as Markdown", {
				description:
					error instanceof Error ? error.message : "Try again in a moment.",
			});
		}
	}, [activeMarkdownTabPath, getCurrentMarkdown]);

	const handlePrintActiveNote = useCallback(async () => {
		if (!activeMarkdownTabPath) return;
		try {
			await saveCurrentEditor();
			const markdown =
				getCurrentMarkdown(activeMarkdownTabPath) ??
				(
					await invoke("space_read_text", {
						path: activeMarkdownTabPath,
					})
				).text;
			const noteAbsPath = await invoke("space_resolve_abs_path", {
				path: activeMarkdownTabPath,
			});
			const html = buildPrintHtml({
				markdown,
				notePath: activeMarkdownTabPath,
				noteAbsPath,
			});
			const path = await invoke("print_write_html", {
				file_stem:
					displayNameFromPath(activeMarkdownTabPath).trim() || "Untitled",
				html,
			});
			await openPath(path);
			toast.success("Opened note for printing.");
		} catch (error) {
			console.error("Failed to print note", error);
			toast.error("Could not open the note for printing", {
				description:
					error instanceof Error ? error.message : "Try again in a moment.",
			});
		}
	}, [activeMarkdownTabPath, getCurrentMarkdown, saveCurrentEditor]);

	const duplicateFileWithActiveEditorFlush = useCallback(
		async (path: string) => {
			if (activeMarkdownTabPath === path) {
				await saveCurrentEditor();
			}
			return fileTree.onDuplicateFile(path);
		},
		[activeMarkdownTabPath, fileTree, saveCurrentEditor],
	);

	const handleDuplicateActiveMarkdown = useCallback(async () => {
		if (!activeMarkdownTabPath || !isMarkdownPath(activeMarkdownTabPath)) {
			return;
		}
		setSidebarCollapsed(false);
		const duplicatedPath = await duplicateFileWithActiveEditorFlush(
			activeMarkdownTabPath,
		);
		if (!duplicatedPath) return;
		window.requestAnimationFrame(() => {
			dispatchFileTreeStartRename({ path: duplicatedPath });
		});
	}, [
		activeMarkdownTabPath,
		duplicateFileWithActiveEditorFlush,
		setSidebarCollapsed,
	]);

	const handleNavigateBreadcrumbPath = useCallback(
		(dirPath: string) => {
			const nextPath = normalizeRelPath(dirPath);
			setSidebarCollapsed(false);
			setActiveDirPath(nextPath);

			const ancestorDirs: string[] = [];
			let current = nextPath;
			while (current) {
				ancestorDirs.unshift(current);
				current = parentDir(current);
			}

			updateExpandedDirs((prev) => {
				const next = new Set(prev);
				for (const dir of ancestorDirs) next.add(dir);
				return next;
			});

			const dirsToLoad = nextPath ? ancestorDirs : [""];
			void Promise.all(dirsToLoad.map((dir) => fileTree.loadDir(dir)));
		},
		[
			fileTree.loadDir,
			setActiveDirPath,
			setSidebarCollapsed,
			updateExpandedDirs,
		],
	);

	const handleStartRenameFromTab = useCallback(
		async (path: string) => {
			const nextPath = path.trim();
			if (!nextPath || !isMarkdownPath(nextPath)) return;
			setSidebarCollapsed(false);
			const parentPath = parentDir(nextPath);
			const ancestorDirs: string[] = [];
			let current = parentPath;
			while (current) {
				ancestorDirs.unshift(current);
				current = parentDir(current);
			}
			updateExpandedDirs((prev) => {
				const next = new Set(prev);
				for (const dir of ancestorDirs) next.add(dir);
				return next;
			});
			const dirsToLoad = parentPath ? ancestorDirs : [""];
			await Promise.all(dirsToLoad.map((dir) => fileTree.loadDir(dir)));
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					dispatchFileTreeStartRename({ path: nextPath });
				});
			});
		},
		[fileTree.loadDir, setSidebarCollapsed, updateExpandedDirs],
	);

	const handleGitSyncFailure = useCallback((cause: unknown) => {
		const message = cause instanceof Error ? cause.message : "Git Sync failed.";
		showGitSyncErrorToast(message);
	}, []);

	const handleGitSyncNow = useCallback(() => {
		void gitSync.syncNow().catch(handleGitSyncFailure);
	}, [gitSync, handleGitSyncFailure]);

	const handleCloseTabOrWindow = useCallback(async () => {
		if (tabs.length > 0) {
			closeActiveTab();
			return;
		}
		await getCurrentWindow()
			.close()
			.catch(() => {});
	}, [closeActiveTab, tabs.length]);

	useMenuListeners({
		onNewNote: handleNewNoteFromMenu,
		onCreateFromTemplate: handleCreateFromTemplateFromMenu,
		onImportFiles: handleImportFilesFromMenu,
		onImportFolder: handleImportFolderFromMenu,
		onOpenPeriodNote: handleOpenPeriodNoteFromMenu,
		onSaveNote: handleSaveNoteFromMenu,
		onPrintNote: handlePrintActiveNote,
		onCloseTab: () => void handleCloseTabOrWindow(),
		onOpenSpace: handleOpenSpace,
		onOpenRecentSpaceAtPath: (path) => {
			void handleSelectSpace(path);
		},
		onCreateSpace: handleCreateSpace,
		closeSpace: handleCloseSpace,
		onRevealSpace: handleRevealSpaceFromMenu,
		onOpenSpaceSettings: handleOpenSpaceSettings,
		onGitSyncNow: handleGitSyncNow,
		onOpenGitSettings: gitSync.openGitSettings,
		onToggleAiPane: handleToggleAiPaneFromMenu,
		onAttachCurrentNoteToAi: handleAttachCurrentNoteFromMenu,
		onAttachAllOpenNotesToAi: handleAttachAllOpenNotesFromMenu,
		onOpenAiSettings: handleOpenAiSettings,
		onEditorAction: (action) => {
			dispatchEditorMenuAction({ action });
		},
	});

	const commands = useAppCommands({
		activeDirPath,
		activeFilePath,
		activeMarkdownTabPath,
		aiEnabled,
		activateNextTab,
		activatePreviousTab,
		attachAllOpenNotesToAi,
		attachCurrentNoteToAi,
		activeTabCanPin: activeTab !== null && activeTab.kind !== "blank",
		activeTabIsPinned: activeTab?.isPinned ?? false,
		canGoBack,
		canGoForward,
		closeActiveTab,
		closeAllTabs,
		closeSpace: handleCloseSpace,
		createDatabaseAndOpen,
		createNoteInSelectedFolder,
		fileTree,
		getBinding,
		gitSync,
		goBack,
		goForward,
		handleCopyOpenNoteAsMarkdown,
		handleCreateFromTemplateFromMenu,
		handleImportFilesFromMenu,
		handleImportFolderFromMenu,
		handleDuplicateActiveMarkdown,
		handleGitSyncFailure,
		handleOpenAiSettings,
		handleOpenSpaceSettings,
		handleRevealSpaceFromMenu,
		movePickerSourcePath,
		moveTargetDirs,
		onCreateSpace: handleCreateSpace,
		onOpenSpace: handleOpenSpace,
		openAllDocsTab,
		openPinnedDocsTab,
		openBlankTab,
		splitPaneWithBlank,
		openDatabasesTab,
		openCalendar,
		openConnectionsView,
		openMarkdownTabsLength: openMarkdownTabs.length,
		openPalette,
		openQuickNoteWindow,
		openSearchPalette,
		openSettings,
		openWorkspaceFile,
		periodNotesEnabled,
		pinnedFiles,
		requestOpenDailyNote,
		requestOpenPeriodNote,
		saveCurrentEditor,
		setCurrentEditorMode,
		setAiPanelOpen,
		setMovePickerSourcePath,
		setSidebarCollapsed,
		showCollapsibleHeadings,
		showCollapsibleLists,
		sidebarCollapsed,
		spacePath,
		tabsLength: tabs.length,
		unpinnedTabsLength: tabs.filter((tab) => !tab.isPinned).length,
		toggleActiveTabPinned,
		togglePinnedFile,
		refreshMoveTargetDirs,
	});

	const shortcutHandlers = useMemo(
		() => [
			{
				id: "close-settings",
				shortcut: { key: "Escape" },
				enabled: settingsMode,
				action: closeSettings,
				allowInEditable: true,
			},
			{
				id: "back-from-settings",
				shortcut: { meta: true, key: "[" },
				enabled: settingsMode,
				action: closeSettings,
				allowInEditable: true,
			},
			{
				id: "open-command-palette",
				shortcut: getBinding("open-command-palette"),
				action: openCommandPalette,
				allowInEditable: true,
			},
			{
				id: "open-search-palette",
				shortcut: getBinding("open-search-palette"),
				action: openSearchPalette,
				allowInEditable: true,
			},
			{
				id: "close-window-when-no-tabs",
				shortcut: getBinding("close-active-tab"),
				enabled: tabs.length === 0,
				action: handleCloseTabOrWindow,
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `activate-tab-${index + 1}`,
				shortcut: getBinding(`activate-tab-${index + 1}`),
				enabled: Boolean(tabs[index]),
				action: () => {
					activateTabByIndex(index);
				},
			})),
			...commands
				.filter((command) => command.id !== "open-quick-note")
				.map((command) => ({
					id: command.id,
					shortcut: command.shortcut,
					enabled: command.enabled,
					allowInEditable: command.allowInEditable,
					action: command.action,
				})),
		],
		[
			activateTabByIndex,
			closeSettings,
			commands,
			getBinding,
			handleCloseTabOrWindow,
			openCommandPalette,
			openSearchPalette,
			settingsMode,
			tabs,
		],
	);

	useCommandShortcuts({
		handlers: shortcutHandlers,
		paletteOpen,
		onClosePalette: closePalette,
	});
	const toggleSidebarShortcut = getBinding("toggle-sidebar");

	useEffect(() => {
		const accelerators = Object.fromEntries(
			actionsWithBindings
				.filter((action) => action.menuId)
				.map((action) => [
					action.menuId as string,
					toTauriAccelerator(action.binding),
				]),
		);
		void invoke("set_menu_shortcuts", { accelerators }).catch(() => {});
	}, [actionsWithBindings]);

	useEffect(() => {
		void invoke("set_quick_note_global_shortcut", {
			accelerator: toTauriAccelerator(getBinding("open-quick-note")),
		}).catch((cause) => {
			console.warn("Failed to register quick note shortcut", cause);
		});
	}, [getBinding]);

	return (
		<div
			className={cn(
				"appShell",
				sidebarCollapsed && "appShellSidebarCollapsed",
				folioMode && "appShellFolioMode",
				rightSidebarOpen && "appShellRightSidebarOpen",
			)}
		>
			{!zenMode && isIndexing ? <IndexingNotice /> : null}
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			{(!zenMode || settingsMode) && sidebarCollapsed ? (
				<div className="sidebarCollapsedToggle">
					<WindowChromeIconButton
						ariaLabel={
							sidebarAutoCollapsed
								? "Sidebar hidden while window is narrow"
								: "Expand sidebar"
						}
						ariaPressed={false}
						disabled={sidebarAutoCollapsed}
						onClick={() => setSidebarCollapsed(false)}
						title={
							sidebarAutoCollapsed
								? "Widen the window to show the sidebar"
								: `Expand sidebar${
										toggleSidebarShortcut
											? ` (${getShortcutTooltip(toggleSidebarShortcut)})`
											: ""
									}`
						}
					>
						<LayoutAlignLeft size="var(--icon-md)" />
					</WindowChromeIconButton>
					<WindowChromeUpdateButton
						updateReady={autoUpdater.updateReady}
						updateVersion={autoUpdater.updateVersion}
						onInstallUpdate={autoUpdater.installAndRelaunch}
					/>
				</div>
			) : null}
			{!zenMode || settingsMode ? (
				<>
					<Sidebar
						onSelectDir={setActiveDirPath}
						onOpenFile={(p) => void openWorkspaceFile(p)}
						onNewNote={() => void createNoteInSelectedFolder()}
						newNoteFolder={newNoteFolder}
						onNewFileInDir={(p) => void fileTree.onNewFileInDir(p)}
						onCreateFromTemplateInDir={(p) => void openTemplatePicker(p)}
						onImportFilesInDir={importFilesInto}
						onImportFolderInDir={importFolderInto}
						onImportPathsInDir={importPathsInto}
						onRequestCreateFolder={(dirPath) =>
							fileTree.requestCreateFolder(dirPath)
						}
						onDuplicateFile={(p) => duplicateFileWithActiveEditorFlush(p)}
						onRenameDir={(p, name, kind) => fileTree.onRenameDir(p, name, kind)}
						onDeletePath={(p, kind) => fileTree.onDeletePath(p, kind)}
						onMovePath={(fromPath, toDirPath, kind) =>
							fileTree.onMovePath(fromPath, toDirPath, kind)
						}
						onToggleDir={fileTree.toggleDir}
						onLoadDir={fileTree.loadDir}
						onExpandAllDirs={fileTree.expandAllDirs}
						onCollapseAllDirs={fileTree.collapseAllDirs}
						onSelectTag={(t) => openTagSearchPalette(t)}
						sidebarCollapsed={sidebarCollapsed}
						onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
						spacePath={spacePath}
						onOpenAllDocs={openAllDocsTab}
						onOpenPinnedDocs={openPinnedDocsTab}
						onOpenConnections={openConnectionsView}
						onOpenDatabases={(databaseId) => openDatabasesTab(databaseId)}
						onOpenCalendar={openCalendar}
						onOpenSearch={openSearchPalette}
						onOpenPeriodNote={requestOpenPeriodNote}
						onOpenQuickNote={openQuickNoteWindow}
						onCreateFromTemplate={handleCreateFromTemplateFromMenu}
						onGitSyncNow={handleGitSyncNow}
						activeTopSection={activeTopSection}
						onPrefetchDatabases={prefetchDatabasesTab}
						onPrefetchAllDocs={prefetchAllDocsTab}
						onPrefetchFile={prefetchWorkspaceFile}
					/>
					<div
						ref={sidebarResize.resizeRef}
						className="sidebarResizeHandle"
						onPointerDown={sidebarResize.handlePointerDown}
						onPointerMove={sidebarResize.handlePointerMove}
						onPointerUp={sidebarResize.handlePointerUp}
						data-window-drag-ignore
						style={{ cursor: sidebarCollapsed ? "default" : "col-resize" }}
					/>
				</>
			) : null}
			<MainContent
				fileTree={{
					createMarkdownFileAtPath: fileTree.createMarkdownFileAtPath,
					openNonMarkdownExternally: fileTree.openNonMarkdownExternally,
					onRenameDir: fileTree.onRenameDir,
					onDeletePath: fileTree.onDeletePath,
				}}
				onOpenFile={openWorkspaceFile}
				onBrowseFile={openBrowseNote}
				onOpenFolioFile={openFolioWorkspaceFile}
				onOpenFileInNewTab={openWorkspaceFileInNewTab}
				onOpenFolioFileInNewTab={openFolioWorkspaceFileInNewTab}
				onOpenCommandPalette={openCommandPalette}
				onOpenDatabase={(databaseId) => openDatabasesTab(databaseId)}
				panes={panes}
				splitLayout={splitLayout}
				focusedPaneId={focusedPaneId}
				rootEntries={rootEntries}
				childrenByDir={childrenByDir}
				activeTabPath={activeTabPath}
				setActiveTabId={setActiveTabId}
				focusPane={focusPane}
				setDirtyByPath={setDirtyByPath}
				closeTab={closeTab}
				toggleTabPinned={toggleTabPinned}
				reorderTabs={reorderTabs}
				openBlankTabInPane={openBlankTabInPane}
				openFileInPane={openFileInPane}
				splitPaneWithFile={splitPaneWithFile}
				moveTabToPane={moveTabToPane}
				resizeSplit={resizeSplit}
				onStartRenamePath={handleStartRenameFromTab}
				onNavigateBreadcrumbPath={handleNavigateBreadcrumbPath}
				onLoadBreadcrumbDir={fileTree.loadDir}
				onGoBackInPane={goBackInPane}
				onGoForwardInPane={goForwardInPane}
				databasesOpenRequest={databasesOpenRequest}
				onConsumeDatabasesOpenRequest={consumeDatabasesOpenRequest}
				dailyNoteSetupNoticeRequest={dailyNoteSetupNoticeRequest}
				onOpenDailyNotesSettings={() => openSettings("space")}
				onRightSidebarOpenChange={setRightSidebarOpen}
				peekNotePath={
					notePeek && notePeek.spacePath === spacePath ? notePeek.relPath : null
				}
				onCloseNotePeek={closeNotePeek}
				onOpenPeekedNote={() => {
					void openPeekedNote();
				}}
			/>
			{!zenMode && commandPaletteMounted ? (
				<Suspense fallback={null}>
					<LazyCommandPalette
						key={`${commandPaletteSessionId}:${paletteLaunchMode}:${paletteInitialQuery}`}
						open={paletteOpen}
						initialMode={paletteLaunchMode}
						initialQuery={paletteInitialQuery}
						commands={commands}
						onClose={closePalette}
						spacePath={spacePath}
						tabs={tabs}
						onActivateTab={setActiveTabId}
						onSelectSearchResult={(id, options) => {
							if (
								options?.query?.trim() &&
								typeof options.matchIndex === "number"
							) {
								requestSearchJump({
									path: id,
									query: options.query.trim(),
									matchIndex: options.matchIndex,
									targetPaneId:
										tabs.find((tab) => tab.kind === "file" && tab.target === id)
											?.paneId ?? focusedPaneId,
								});
							}
							void openWorkspaceFile(id);
						}}
						onRevealFolder={handleNavigateBreadcrumbPath}
						onOpenDatabase={(id) => openDatabasesTab(id)}
						templateFolder={templateFolder}
						onCreateFromTemplate={(template) =>
							void handlePickTemplate(template, "")
						}
					/>
				</Suspense>
			) : null}
			{!zenMode ? (
				<>
					<CalendarPaletteController
						open={calendarOpen}
						onClose={closeCalendar}
						spacePath={spacePath}
						dailyNoteFolder={dailyNotesFolder}
						onOpenNote={(path) => void openWorkspaceFile(path)}
						onOpenPeriodNoteAtDate={(kind, date) =>
							void handleOpenPeriodNoteAtDate(kind, date)
						}
					/>
					<TemplatePickerDialog
						open={templatePickerOpen}
						templates={templatePickerItems}
						onClose={() => setTemplatePickerOpen(false)}
						onPick={(template) => void handlePickTemplate(template)}
						onOpenSettings={openTemplatesSettings}
					/>
				</>
			) : null}
		</div>
	);
}
