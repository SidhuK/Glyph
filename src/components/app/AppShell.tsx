import { cn } from "@/lib/utils";
import { join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { AnimatePresence } from "motion/react";
import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	useAISidebarContext,
	useEditorContext,
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
	useUpdaterContext,
} from "../../contexts";
import {
	CHANGELOG_DATA,
	type VersionReleaseNotes,
} from "../../data/releaseNotes";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useDailyNote } from "../../hooks/useDailyNote";
import { useFileTree } from "../../hooks/useFileTree";
import { useGitSync } from "../../hooks/useGitSync";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import { ALL_DOCS_TAB_ID } from "../../lib/allDocs";
import {
	dispatchEditorMenuAction,
	dispatchFileTreeStartRename,
	dispatchPathRemoved,
} from "../../lib/appEvents";
import { CALENDAR_TAB_ID } from "../../lib/calendar";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { promptNoteExportPath } from "../../lib/export";
import {
	invalidateAllDocsPrefetch,
	invalidateCalendarPrefetch,
	invalidateDatabaseRowsPrefetch,
	invalidatePrefetchedNote,
	prefetchAllDocs,
	prefetchCalendarData,
	prefetchDatabasesLanding,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import {
	getLastSeenReleaseNotesVersion,
	loadSettings,
	setLastSeenReleaseNotesVersion,
	updateOnboardingSettings,
} from "../../lib/settings";
import { getShortcutTooltip, toTauriAccelerator } from "../../lib/shortcuts";
import { todayIsoDateLocal } from "../../lib/tasks";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { listTemplates, renderTemplate } from "../../lib/templates";
import { TEMPLATES_TAB_ID } from "../../lib/templatesView";
import { isInAppPreviewable } from "../../utils/filePreview";
import { isMarkdownPath, normalizeRelPath, parentDir } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { dispatchAiContextAttach } from "../ai/aiContextEvents";
import { NoteExportHtmlHost } from "../export/NoteExportHtmlHost";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";
import {
	TemplatePickerDialog,
	type TemplatePickerItem,
} from "./TemplatePickerDialog";
import { WebClipDialog } from "./WebClipDialog";
import { WhatsNewDialog } from "./WhatsNewDialog";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";
import {
	loadAllDocsPane,
	loadCalendarPane,
	loadDatabasesPane,
} from "./prefetchablePanes";
import { useAppCommands } from "./useAppCommands";
import { useTabManager } from "./useTabManager";
import { useWorkspaceLinkEvents } from "./useWorkspaceLinkEvents";

const loadCommandPalette = () =>
	import("./CommandPalette").then((module) => ({
		default: module.CommandPalette,
	}));

const LazyCommandPalette = lazy(loadCommandPalette);

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 600;
const PRINT_EDITOR_BODY_CLASS = "glyphPrintEditorMode";
const PRINT_EDITOR_TARGET_CLASS = "glyphPrintEditorTarget";
export function AppShell() {
	const space = useSpace();
	const {
		spacePath,
		error,
		setError,
		onOpenSpace,
		onOpenSpaceAtPath,
		onCreateSpace,
		closeSpace,
		recentSpaces,
	} = space;
	const fileTreeCtx = useFileTreeContext();
	const {
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
	} = fileTreeCtx;
	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		zenModeActive,
		setZenModeActive,
		paletteOpen,
		setPaletteOpen,
		activePreviewPath,
		setActivePreviewPath,
		openMarkdownTabs,
		activeMarkdownTabPath,
		dailyNotesFolder,
		templateFolder,
		dailyNoteTemplatePath,
		sidebarWidth,
		setSidebarWidth,
		openSettings,
	} = useUILayoutContext();
	const { aiEnabled, setAiPanelOpen } = useAISidebarContext();
	const { getCurrentMarkdown, saveCurrentEditor } = useEditorContext();

	const [paletteInitialTab, setPaletteInitialTab] = useState<
		"commands" | "search"
	>("commands");
	const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
	const [openDatabasesId, setOpenDatabasesId] = useState<string | null>(null);
	const [showGettingStartedRequest, setShowGettingStartedRequest] = useState(0);
	const [dailyNoteSetupNoticeRequest, setDailyNoteSetupNoticeRequest] =
		useState(0);
	const [movePickerSourcePath, setMovePickerSourcePath] = useState<
		string | null
	>(null);
	const [moveTargetDirs, setMoveTargetDirs] = useState<string[]>([]);
	const [webClipDialogOpen, setWebClipDialogOpen] = useState(false);
	const [webClipUrl, setWebClipUrl] = useState("");
	const [webClipLoading, setWebClipLoading] = useState(false);
	const [commandPaletteMounted, setCommandPaletteMounted] = useState(false);
	const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
	const [templatePickerDirPath, setTemplatePickerDirPath] = useState("");
	const [templatePickerItems, setTemplatePickerItems] = useState<
		TemplatePickerItem[]
	>([]);
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [commandPaletteSessionId, setCommandPaletteSessionId] = useState(0);
	const [htmlExportRequest, setHtmlExportRequest] = useState<{
		id: string;
		relPath: string;
		markdown: string;
		outputPath: string;
	} | null>(null);
	const [whatsNewVersion, setWhatsNewVersion] =
		useState<VersionReleaseNotes | null>(null);
	const htmlExportResolversRef = useRef(
		new Map<
			string,
			{
				outputPath: string;
				resolve: () => void;
				reject: (reason?: unknown) => void;
			}
		>(),
	);
	const autoUpdater = useUpdaterContext();
	const gitSync = useGitSync({
		spacePath,
		saveCurrentEditor,
	});
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
		let cancelled = false;
		const idle = window.setTimeout(() => {
			void loadCommandPalette().then(() => {
				if (!cancelled) setCommandPaletteMounted(true);
			});
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
			})
			.catch((error) => {
				console.error("Failed to load collapsible heading setting", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [appInfo, lastSeenVersion] = await Promise.all([
					invoke("app_info"),
					getLastSeenReleaseNotesVersion(),
				]);
				const version = CHANGELOG_DATA.versions.find(
					(entry) => entry.version === appInfo.version,
				);
				if (cancelled || !version || lastSeenVersion === version.version)
					return;
				setWhatsNewVersion(version);
			} catch (error) {
				console.warn("Failed to load release notes prompt state", error);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const closeWhatsNewDialog = useCallback(() => {
		const version = whatsNewVersion?.version;
		setWhatsNewVersion(null);
		if (version) void setLastSeenReleaseNotesVersion(version);
	}, [whatsNewVersion?.version]);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload: { editor?: { showCollapsibleHeadings?: boolean } }) => {
				if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
					setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
				}
			},
			[],
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
				setError(message);
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
	}, [gitSync.status, setError]);

	const fileTree = useFileTree({
		spacePath,
		expandedDirs,
		updateChildrenByDir,
		updateExpandedDirs,
		updateRootEntries,
		renamePinnedPath,
		deletePinnedPath,
		renameItemAppearance,
		deleteItemAppearance,
		setActiveFilePath,
		setActiveDirPath,
		setActivePreviewPath,
		activeFilePath,
		activePreviewPath,
		setError,
	});

	const {
		tabs,
		activeTabId,
		activeTabPath,
		setActiveTabId,
		setDirtyByPath,
		closeTab,
		closeAllTabs,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openBlankTab,
		replaceActiveTabWithBlank,
		openFileTab,
		openSpecialTab,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		activateNextTab,
		activatePreviousTab,
		activateTabByIndex,
	} = useTabManager(spacePath);
	const { getBinding, actionsWithBindings } = useShortcutBindings();

	useEffect(() => {
		const visible =
			activeMarkdownTabPath !== null && isMarkdownPath(activeMarkdownTabPath);
		void invoke("set_markdown_menu_visible", { visible }).catch(() => {});
	}, [activeMarkdownTabPath]);

	const openWorkspaceFile = useCallback(
		async (path: string) => {
			if (!path) return;
			if (isMarkdownPath(path) || isInAppPreviewable(path)) {
				setActiveDirPath(parentDir(path));
				openFileTab(path);
				return;
			}
			await fileTree.openFile(path);
		},
		[fileTree, openFileTab, setActiveDirPath],
	);

	const openWorkspaceFileInNewTab = useCallback(
		async (path: string) => {
			if (!path) return;
			openBlankTab();
			await openWorkspaceFile(path);
		},
		[openBlankTab, openWorkspaceFile],
	);

	const openQuickNoteWindow = useCallback(() => {
		void invoke("show_quick_note_window").catch((cause) => {
			const message = cause instanceof Error ? cause.message : String(cause);
			setError(message);
		});
	}, [setError]);

	useTauriEvent("quick-note:open_note", (payload) => {
		void openWorkspaceFile(payload.path).catch((cause) => {
			console.error("Failed to open quick note", cause);
			const message = cause instanceof Error ? cause.message : String(cause);
			setError(message);
			toast.error("Could not open quick note", { description: message });
		});
	});

	const { openOrCreateDailyNote } = useDailyNote({
		onOpenFile: (path) => openWorkspaceFile(path),
		setError,
		spacePath,
		templatePath: dailyNoteTemplatePath,
	});

	const openTemplatesSettings = useCallback(() => {
		openSettings("space");
	}, [openSettings]);

	const openTemplatePicker = useCallback(
		async (dirPath?: string) => {
			if (!spacePath) return;
			if (templateFolder === null) {
				setError("Set a template folder in Settings -> Space first.");
				openTemplatesSettings();
				return;
			}
			try {
				const templates = await listTemplates(templateFolder);
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
		async (template: TemplatePickerItem) => {
			if (!spacePath) return;
			setTemplatePickerOpen(false);
			try {
				const { save } = await import("@tauri-apps/plugin-dialog");
				const suggestedFileName =
					template.relPath.split("/").pop()?.trim() || "Untitled.md";
				const defaultPath = templatePickerDirPath
					? await join(spacePath, templatePickerDirPath, suggestedFileName)
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
					templatePickerDirPath &&
					normalizedRelPath !== templatePickerDirPath &&
					!normalizedRelPath.startsWith(`${templatePickerDirPath}/`)
				) {
					setError(`Choose a file path inside "${templatePickerDirPath}"`);
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
					openParentDir: templatePickerDirPath,
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

	const handleOpenDailyNote = useCallback(async () => {
		if (!dailyNotesFolder) return;
		try {
			await openOrCreateDailyNote(dailyNotesFolder);
		} catch (e) {
			setError(
				`Failed to open daily note: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}, [dailyNotesFolder, openOrCreateDailyNote, setError]);

	const requestOpenDailyNote = useCallback(() => {
		if (!spacePath) return;
		if (!dailyNotesFolder) {
			setDailyNoteSetupNoticeRequest((value) => value + 1);
			return;
		}
		void handleOpenDailyNote();
	}, [dailyNotesFolder, handleOpenDailyNote, spacePath]);

	const fsRefreshQueueRef = useRef<Set<string>>(new Set());
	const fsRefreshTimerRef = useRef<number | null>(null);
	const moveTargetDirsRequestIdRef = useRef(0);

	const openPalette = useCallback(
		(tab: "commands" | "search", query = "") => {
			setPaletteInitialTab(tab);
			setPaletteInitialQuery(query);
			setCommandPaletteSessionId((value) => value + 1);
			setCommandPaletteMounted(true);
			setPaletteOpen(true);
		},
		[setPaletteOpen],
	);
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
			const out: string[] = [];
			const seen = new Set<string>([""]);
			const queue: string[] = [""];
			while (queue.length > 0 && out.length < 5000) {
				const dir = queue.shift() ?? "";
				const entries = await invoke("space_list_dir", dir ? { dir } : {});
				for (const entry of entries) {
					if (entry.kind !== "dir" || seen.has(entry.rel_path)) continue;
					seen.add(entry.rel_path);
					out.push(entry.rel_path);
					queue.push(entry.rel_path);
				}
			}
			if (moveTargetDirsRequestIdRef.current !== requestId) return;
			const fromDir = parentDir(sourcePath);
			setMoveTargetDirs(
				out.filter((d) => d !== fromDir).sort((a, b) => a.localeCompare(b)),
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
		openPalette,
		openWorkspaceFile,
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

	const createNoteInSelectedFolder = useCallback(async () => {
		if (!spacePath) return null;
		const nextDir =
			dailyNotesFolder && activeDirPath === dailyNotesFolder
				? ""
				: (activeDirPath ?? "");
		return fileTree.onNewFileInDir(nextDir);
	}, [activeDirPath, dailyNotesFolder, fileTree, spacePath]);

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

	const handleOpenDailyNoteFromMenu = useCallback(() => {
		requestOpenDailyNote();
	}, [requestOpenDailyNote]);

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

	const handleCloseAiPaneFromMenu = useCallback(() => {
		setAiPanelOpen(false);
	}, [setAiPanelOpen]);

	const handleAttachCurrentNoteFromMenu = useCallback(() => {
		void attachCurrentNoteToAi();
	}, [attachCurrentNoteToAi]);

	const handleAttachAllOpenNotesFromMenu = useCallback(() => {
		void attachAllOpenNotesToAi();
	}, [attachAllOpenNotesToAi]);

	const handleOpenAiSettings = useCallback(() => {
		openSettings("ai");
	}, [openSettings]);

	const handleSpaceFsChanged = useCallback(
		(payload: { rel_path: string; removed: boolean }) => {
			if (!spacePath) return;
			const changedPath = normalizeRelPath(payload.rel_path);
			if (!changedPath) return;
			if (payload.removed) {
				dispatchPathRemoved({ path: changedPath, recursive: true });
			}
			fsRefreshQueueRef.current.add(changedPath);
			if (fsRefreshTimerRef.current !== null) return;
			fsRefreshTimerRef.current = window.setTimeout(() => {
				fsRefreshTimerRef.current = null;
				const changed = [...fsRefreshQueueRef.current];
				fsRefreshQueueRef.current.clear();
				if (!changed.length) return;
				const dirs = new Set<string>([""]);
				for (const rel of changed) {
					dirs.add(parentDir(rel));
					if (expandedDirs.has(rel)) dirs.add(rel);
				}
				for (const dir of dirs) void fileTree.loadDir(dir, true);
			}, 150);
		},
		[expandedDirs, fileTree.loadDir, spacePath],
	);

	useTauriEvent("space:fs_changed", handleSpaceFsChanged);
	useTauriEvent("notes:external_changed", (payload) => {
		const relPath = normalizeRelPath(payload.rel_path);
		invalidateAllDocsPrefetch();
		invalidateCalendarPrefetch();
		invalidateDatabaseRowsPrefetch();
		if (relPath) {
			invalidatePrefetchedNote(relPath);
		}
	});
	useEffect(
		() => () => {
			if (fsRefreshTimerRef.current !== null)
				window.clearTimeout(fsRefreshTimerRef.current);
		},
		[],
	);

	const activeTopSection = useMemo<
		"home" | "all-notes" | "databases" | null
	>(() => {
		if (activeTabId === CALENDAR_TAB_ID) return "home";
		if (activeTabId === ALL_DOCS_TAB_ID) return "all-notes";
		if (activeTabId === DATABASES_TAB_ID) return "databases";
		return null;
	}, [activeTabId]);
	const openCommandPalette = useCallback(() => {
		openPalette("commands");
		void updateOnboardingSettings({ usedCommandPalette: true });
	}, [openPalette]);
	const openSearchPalette = useCallback(() => {
		if (!spacePath) {
			openCommandPalette();
			return;
		}
		openPalette("search");
	}, [openCommandPalette, openPalette, spacePath]);
	const openAllDocsTab = useCallback(() => {
		openSpecialTab(ALL_DOCS_TAB_ID);
	}, [openSpecialTab]);
	const openTemplatesTab = useCallback(() => {
		openSpecialTab(TEMPLATES_TAB_ID);
	}, [openSpecialTab]);
	const openCalendarTab = useCallback(() => {
		openSpecialTab(CALENDAR_TAB_ID);
	}, [openSpecialTab]);
	const openDatabasesTab = useCallback(
		(databaseId?: string | null) => {
			setOpenDatabasesId(databaseId ?? null);
			openSpecialTab(DATABASES_TAB_ID);
		},
		[openSpecialTab],
	);
	const createDatabaseAndOpen = useCallback(async () => {
		try {
			const summaries = await invoke("databases_list");
			const existing = new Set(
				summaries.map((entry) => entry.name.trim().toLowerCase()),
			);
			let name = "New Database";
			if (existing.has(name.toLowerCase())) {
				let suffix = 2;
				while (existing.has(`new database ${suffix}`)) {
					suffix += 1;
				}
				name = `New Database ${suffix}`;
			}
			const created = await invoke("databases_create", {
				name,
			});
			openDatabasesTab(created.database.id);
			return created.database.id;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setError(message);
			toast.error("Could not create database", {
				description: message,
			});
			return null;
		}
	}, [openDatabasesTab, setError]);
	const prefetchWorkspaceFile = useCallback((path: string) => {
		if (!isMarkdownPath(path)) return;
		prefetchNote(path);
	}, []);
	const prefetchCalendarTab = useCallback(() => {
		void loadCalendarPane();
		const today = todayIsoDateLocal();
		const anchorDate = window.localStorage.getItem("glyph.calendar.anchorDate");
		const selectedDate = window.localStorage.getItem(
			"glyph.calendar.selectedDate",
		);
		void prefetchCalendarData({
			anchorDate: anchorDate ?? today,
			selectedDate: selectedDate ?? today,
			dailyNotesFolder,
		});
	}, [dailyNotesFolder]);
	const prefetchDatabasesTab = useCallback((databaseId?: string | null) => {
		void loadDatabasesPane();
		void prefetchDatabasesLanding(databaseId);
	}, []);
	const prefetchAllDocsTab = useCallback(() => {
		void loadAllDocsPane();
		void prefetchAllDocs(null);
	}, []);
	const openGettingStarted = useCallback(() => {
		setShowGettingStartedRequest((prev) => prev + 1);
	}, []);

	const handleCreateNoteFromStarter = useCallback(async () => {
		if (!spacePath) return;
		const createdPath = await createNoteInSelectedFolder();
		if (createdPath) {
			await openWorkspaceFile(createdPath);
		}
	}, [createNoteInSelectedFolder, openWorkspaceFile, spacePath]);

	const handleCopyOpenNoteAsMarkdown = useCallback(async () => {
		if (!activeMarkdownTabPath) return;

		try {
			const editorMarkdown = getCurrentMarkdown(activeMarkdownTabPath);
			const markdown =
				editorMarkdown ??
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

	const handleHtmlExportComplete = useCallback(
		async ({ id, html }: { id: string; html: string }) => {
			const pending = htmlExportResolversRef.current.get(id);
			if (!pending) return;
			htmlExportResolversRef.current.delete(id);
			setHtmlExportRequest((current) => (current?.id === id ? null : current));
			try {
				await invoke("export_write_text", {
					abs_path: pending.outputPath,
					text: html,
				});
				pending.resolve();
			} catch (error) {
				pending.reject(error);
			}
		},
		[],
	);

	const handleHtmlExportError = useCallback(
		({ id, message }: { id: string; message: string }) => {
			const pending = htmlExportResolversRef.current.get(id);
			if (!pending) return;
			htmlExportResolversRef.current.delete(id);
			setHtmlExportRequest((current) => (current?.id === id ? null : current));
			pending.reject(new Error(message));
		},
		[],
	);

	const handleExportHtml = useCallback(() => {
		if (!activeMarkdownTabPath) {
			const message = "Open a markdown note before exporting.";
			setError(message);
			toast.error("Could not export as HTML", {
				description: message,
			});
			return;
		}
		if (htmlExportRequest !== null || htmlExportResolversRef.current.size > 0) {
			toast.message("HTML export already in progress.", {
				description:
					"Wait for the current export to finish before starting another.",
			});
			return;
		}

		void (async () => {
			try {
				const outputPath = await promptNoteExportPath(activeMarkdownTabPath);
				if (!outputPath) return;
				await saveCurrentEditor();
				const markdown =
					getCurrentMarkdown(activeMarkdownTabPath) ??
					(
						await invoke("space_read_text", {
							path: activeMarkdownTabPath,
						})
					).text;
				const requestId = crypto.randomUUID();
				const exportPromise = new Promise<void>((resolve, reject) => {
					htmlExportResolversRef.current.set(requestId, {
						outputPath,
						resolve,
						reject,
					});
				});
				setHtmlExportRequest({
					id: requestId,
					relPath: activeMarkdownTabPath,
					markdown,
					outputPath,
				});
				await exportPromise;
				toast.success("Exported note as HTML.", {
					description: outputPath,
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to export note.";
				console.error("Failed to export note as HTML", error);
				setError(message);
				toast.error("Could not export as HTML", {
					description: message,
				});
			}
		})();
	}, [
		activeMarkdownTabPath,
		getCurrentMarkdown,
		htmlExportRequest,
		saveCurrentEditor,
		setError,
	]);

	const handlePrintEditorPane = useCallback(() => {
		if (!activeMarkdownTabPath || !isMarkdownPath(activeMarkdownTabPath)) {
			toast.error("Open a markdown note before printing.");
			return;
		}
		const target = document.querySelector(
			".markdownEditorPane",
		) as HTMLElement | null;
		if (!target) {
			toast.error("Could not find an active editor to print.");
			return;
		}

		const body = document.body;
		const mediaQuery = window.matchMedia("print");
		let cleanedUp = false;
		let cleanupTimer: number | null = null;
		const cleanup = () => {
			if (cleanedUp) return;
			cleanedUp = true;
			if (cleanupTimer !== null) {
				window.clearTimeout(cleanupTimer);
				cleanupTimer = null;
			}
			body.classList.remove(PRINT_EDITOR_BODY_CLASS);
			target.classList.remove(PRINT_EDITOR_TARGET_CLASS);
			window.removeEventListener("afterprint", cleanup);
			mediaQuery.removeEventListener("change", onMediaQueryChange);
		};
		const onMediaQueryChange = (event: MediaQueryListEvent) => {
			if (!event.matches) cleanup();
		};

		body.classList.add(PRINT_EDITOR_BODY_CLASS);
		target.classList.add(PRINT_EDITOR_TARGET_CLASS);
		window.addEventListener("afterprint", cleanup, { once: true });
		mediaQuery.addEventListener("change", onMediaQueryChange);
		cleanupTimer = window.setTimeout(cleanup, 15_000);
		// Let the command palette/dialog close commit before snapshotting for print.
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				void invoke("print_current_window").catch((error) => {
					cleanup();
					toast.error("Could not open print dialog", {
						description:
							error instanceof Error ? error.message : "Try again in a moment.",
					});
				});
			});
		});
	}, [activeMarkdownTabPath]);

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

	const handleGitSyncFailure = useCallback(
		(cause: unknown) => {
			const message =
				cause instanceof Error ? cause.message : "Git Sync failed.";
			setError(message);
			toast.error("Git Sync failed", {
				description: message,
			});
		},
		[setError],
	);

	const handleWebClipSave = useCallback(async () => {
		const url = webClipUrl.trim();
		if (!url) return;
		setWebClipLoading(true);
		setWebClipDialogOpen(false);
		try {
			const { getWebClippingsFolder } = await import("../../lib/settings");
			const folder = (await getWebClippingsFolder()) ?? undefined;
			const result = await invoke("web_clip_save", { url, folder });
			toast.success(`Saved "${result.title}"`);
			await openWorkspaceFile(result.rel_path);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			toast.error("Failed to save web page", { description: message });
		} finally {
			setWebClipLoading(false);
		}
	}, [webClipUrl, openWorkspaceFile]);

	useMenuListeners({
		onNewNote: handleNewNoteFromMenu,
		onCreateFromTemplate: handleCreateFromTemplateFromMenu,
		onOpenDailyNote: handleOpenDailyNoteFromMenu,
		onSaveNote: handleSaveNoteFromMenu,
		onExportHtml: handleExportHtml,
		onCloseTab: () => {
			window.dispatchEvent(new Event("glyph:close-active-tab"));
		},
		onOpenSpace,
		onOpenRecentSpaceAtPath: onOpenSpaceAtPath,
		onCreateSpace,
		closeSpace,
		onRevealSpace: handleRevealSpaceFromMenu,
		onOpenSpaceSettings: handleOpenSpaceSettings,
		onGitSyncNow: () => {
			void gitSync.syncNow().catch(handleGitSyncFailure);
		},
		onOpenGitSettings: gitSync.openGitSettings,
		onToggleAiPane: handleToggleAiPaneFromMenu,
		onCloseAiPane: handleCloseAiPaneFromMenu,
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
		canGoBack,
		canGoForward,
		closeActiveTab,
		closeAllTabs,
		closeSpace,
		createDatabaseAndOpen,
		createNoteInSelectedFolder,
		fileTree,
		getBinding,
		gitSync,
		goBack,
		goForward,
		handleCloseAiPaneFromMenu,
		handleCopyOpenNoteAsMarkdown,
		handleCreateFromTemplateFromMenu,
		handleDuplicateActiveMarkdown,
		handleExportHtml,
		handleGitSyncFailure,
		handleOpenAiSettings,
		handleOpenSpaceSettings,
		handlePrintEditorPane,
		handleRevealSpaceFromMenu,
		movePickerSourcePath,
		moveTargetDirs,
		onCreateSpace,
		onOpenSpace,
		openAllDocsTab,
		openBlankTab,
		openCalendarTab,
		openDatabasesTab,
		openGettingStarted,
		openMarkdownTabsLength: openMarkdownTabs.length,
		openPalette,
		openQuickNoteWindow,
		openSearchPalette,
		openSettings,
		openSpecialTab,
		openTemplatesTab,
		openWorkspaceFile,
		pinnedFiles,
		requestOpenDailyNote,
		saveCurrentEditor,
		setActivePreviewPath,
		setAiPanelOpen,
		setError,
		setMovePickerSourcePath,
		setSidebarCollapsed,
		setWebClipDialogOpen,
		setWebClipUrl,
		setZenModeActive,
		showCollapsibleHeadings,
		sidebarCollapsed,
		spacePath,
		tabsLength: tabs.length,
		togglePinnedFile,
		refreshMoveTargetDirs,
		zenModeActive,
	});

	const shortcutHandlers = useMemo(
		() => [
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
			...Array.from({ length: 9 }, (_, index) => ({
				id: `activate-tab-${index + 1}`,
				shortcut: getBinding(`activate-tab-${index + 1}`),
				enabled: Boolean(tabs[index]),
				action: () => {
					activateTabByIndex(index);
				},
			})),
			...commands.map((command) => ({
				id: command.id,
				shortcut: command.shortcut,
				enabled: command.enabled,
				allowInEditable: command.allowInEditable,
				action: command.action,
			})),
		],
		[
			activateTabByIndex,
			commands,
			getBinding,
			openCommandPalette,
			openSearchPalette,
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
				zenModeActive && "appShellZenMode",
			)}
		>
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			{sidebarCollapsed && !zenModeActive && (
				<div className="sidebarCollapsedToggle">
					<WindowChromeIconButton
						ariaLabel="Expand sidebar"
						ariaPressed={false}
						onClick={() => setSidebarCollapsed(false)}
						title={`Expand sidebar${
							toggleSidebarShortcut
								? ` (${getShortcutTooltip(toggleSidebarShortcut)})`
								: ""
						}`}
					>
						<LayoutAlignLeft size={14} />
					</WindowChromeIconButton>
					<WindowChromeUpdateButton
						updateReady={autoUpdater.updateReady}
						updateVersion={autoUpdater.updateVersion}
						onInstallUpdate={autoUpdater.installAndRelaunch}
					/>
				</div>
			)}
			<Sidebar
				onSelectDir={setActiveDirPath}
				onOpenFile={(p) => void openWorkspaceFile(p)}
				onNewNote={() => void createNoteInSelectedFolder()}
				onNewFileInDir={(p) => void fileTree.onNewFileInDir(p)}
				onCreateFromTemplateInDir={(p) => void openTemplatePicker(p)}
				onNewDatabaseInDir={async () => createDatabaseAndOpen()}
				onNewFolderInDir={(p) => fileTree.onNewFolderInDir(p)}
				onDuplicateFile={(p) => duplicateFileWithActiveEditorFlush(p)}
				onRenameDir={(p, name, kind) => fileTree.onRenameDir(p, name, kind)}
				onDeletePath={(p, kind) => fileTree.onDeletePath(p, kind)}
				onMovePath={(fromPath, toDirPath, kind) =>
					fileTree.onMovePath(fromPath, toDirPath, kind)
				}
				onToggleDir={fileTree.toggleDir}
				onLoadDir={fileTree.loadDir}
				onSelectTag={(t) => openTagSearchPalette(t)}
				sidebarCollapsed={sidebarCollapsed}
				onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
				spacePath={spacePath}
				recentSpaces={recentSpaces}
				onOpenSpace={onOpenSpace}
				onOpenRecentSpaceAtPath={onOpenSpaceAtPath}
				gitSyncStatus={gitSync.status}
				onOpenSettings={() => openSettings()}
				onOpenAllDocs={openAllDocsTab}
				onOpenCalendar={openCalendarTab}
				onOpenDatabases={(databaseId) => openDatabasesTab(databaseId)}
				activeTopSection={activeTopSection}
				onPrefetchCalendar={prefetchCalendarTab}
				onPrefetchDatabases={prefetchDatabasesTab}
				onPrefetchAllDocs={prefetchAllDocsTab}
				onPrefetchFile={prefetchWorkspaceFile}
				onOpenSearchPalette={openSearchPalette}
			/>
			{!zenModeActive ? (
				<div
					ref={sidebarResize.resizeRef}
					className="sidebarResizeHandle"
					onPointerDown={sidebarResize.handlePointerDown}
					onPointerMove={sidebarResize.handlePointerMove}
					onPointerUp={sidebarResize.handlePointerUp}
					data-window-drag-ignore
					style={{ cursor: sidebarCollapsed ? "default" : "col-resize" }}
				/>
			) : null}
			<MainContent
				fileTree={fileTree}
				onOpenFile={openWorkspaceFile}
				onOpenFileInNewTab={openWorkspaceFileInNewTab}
				onOpenCommandPalette={openCommandPalette}
				onCreateNote={handleCreateNoteFromStarter}
				onOpenDailyNote={requestOpenDailyNote}
				tabs={tabs}
				activeTabId={activeTabId}
				activeTabPath={activeTabPath}
				setActiveTabId={setActiveTabId}
				setDirtyByPath={setDirtyByPath}
				closeTab={closeTab}
				closeActiveTab={closeActiveTab}
				closeTabsForPathRemoval={closeTabsForPathRemoval}
				renameTabsForPath={renameTabsForPath}
				reorderTabs={reorderTabs}
				openBlankTab={openBlankTab}
				onStartRenamePath={handleStartRenameFromTab}
				replaceActiveTabWithBlank={replaceActiveTabWithBlank}
				canGoBack={canGoBack}
				canGoForward={canGoForward}
				onGoBack={goBack}
				onGoForward={goForward}
				showGettingStartedRequest={showGettingStartedRequest}
				openDatabasesId={openDatabasesId}
				dailyNoteSetupNoticeRequest={dailyNoteSetupNoticeRequest}
				onOpenDailyNotesSettings={() => openSettings("general")}
			/>
			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
			{commandPaletteMounted ? (
				<Suspense fallback={null}>
					<LazyCommandPalette
						key={`${commandPaletteSessionId}:${paletteInitialTab}:${paletteInitialQuery}`}
						open={paletteOpen}
						initialTab={paletteInitialTab}
						initialQuery={paletteInitialQuery}
						commands={commands}
						onClose={closePalette}
						spacePath={spacePath}
						onSelectSearchResult={(id) => void openWorkspaceFile(id)}
					/>
				</Suspense>
			) : null}
			<TemplatePickerDialog
				open={templatePickerOpen}
				templates={templatePickerItems}
				onClose={() => setTemplatePickerOpen(false)}
				onPick={(template) => void handlePickTemplate(template)}
				onOpenSettings={openTemplatesSettings}
			/>
			<NoteExportHtmlHost
				key={htmlExportRequest?.id ?? "idle"}
				request={htmlExportRequest}
				onComplete={({ id, html }) => {
					void handleHtmlExportComplete({ id, html });
				}}
				onError={handleHtmlExportError}
			/>
			<WhatsNewDialog
				open={whatsNewVersion !== null}
				version={whatsNewVersion}
				onClose={closeWhatsNewDialog}
			/>
			<WebClipDialog
				open={webClipDialogOpen}
				url={webClipUrl}
				loading={webClipLoading}
				onOpenChange={(open) => {
					if (!open) setWebClipDialogOpen(false);
				}}
				onUrlChange={setWebClipUrl}
				onSubmit={() => void handleWebClipSave()}
			/>
		</div>
	);
}
