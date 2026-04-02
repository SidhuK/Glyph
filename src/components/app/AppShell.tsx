import { cn } from "@/lib/utils";
import {
	AiChat02Icon,
	Calendar03Icon,
	CalendarAdd01Icon,
	ColorsIcon,
	CursorInWindowIcon,
	DocumentCodeIcon,
	File01Icon,
	Folder01Icon,
	FolderOpenIcon,
	Home01Icon,
	InformationCircleIcon,
	LibraryIcon,
	Link01Icon,
	MoveIcon,
	NoteIcon,
	PencilEdit02Icon,
	PinIcon,
	PinOffIcon,
	Plant01Icon,
	SearchIcon,
	Settings01Icon,
	SidebarLeftIcon,
	SquareLock02Icon,
	TableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { join } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
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
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useDailyNote } from "../../hooks/useDailyNote";
import { useFileTree } from "../../hooks/useFileTree";
import { useGitSync } from "../../hooks/useGitSync";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useWhatsNew } from "../../hooks/useWhatsNew";
import { AI_AGENT_TAB_ID } from "../../lib/aiAgent";
import {
	dispatchFileTreeStartRename,
	dispatchForceNoteEditMode,
	dispatchPathRemoved,
	dispatchZenModeWillToggle,
} from "../../lib/appEvents";
import { promptNoteExportPath } from "../../lib/export";
import { getLicenseStatus } from "../../lib/license";
import { updateOnboardingSettings } from "../../lib/settings";
import type { Shortcut } from "../../lib/shortcuts";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { listTemplates, renderTemplate } from "../../lib/templates";
import { openSettingsWindow } from "../../lib/windows";
import { isInAppPreviewable } from "../../utils/filePreview";
import { isMarkdownPath } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import { FileHtml, LayoutAlignLeft } from "../Icons";
import { AIFloatingHost } from "../ai/AIFloatingHost";
import { dispatchAiContextAttach } from "../ai/aiContextEvents";
import {
	MARKDOWN_LINK_CLICK_EVENT,
	type MarkdownLinkClickDetail,
	TAG_CLICK_EVENT,
	type TagClickDetail,
	WIKI_LINK_CLICK_EVENT,
	type WikiLinkClickDetail,
} from "../editor/markdown/editorEvents";
import { NoteExportHtmlHost } from "../export/NoteExportHtmlHost";
import type { Command } from "./CommandPalette";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";
import {
	TemplatePickerDialog,
	type TemplatePickerItem,
} from "./TemplatePickerDialog";
import { WhatsNewDialog } from "./WhatsNewDialog";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";
import { normalizeRelPath, parentDir } from "./appShellHelpers";
import { useTabManager } from "./useTabManager";

const loadCommandPalette = () =>
	import("./CommandPalette").then((module) => ({
		default: module.CommandPalette,
	}));

const loadKeyboardShortcutsHelp = () =>
	import("./KeyboardShortcutsHelp").then((module) => ({
		default: module.KeyboardShortcutsHelp,
	}));

const LazyCommandPalette = lazy(loadCommandPalette);
const LazyKeyboardShortcutsHelp = lazy(loadKeyboardShortcutsHelp);

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 600;

export function AppShell() {
	const space = useSpace();
	const { spacePath, error, setError, onOpenSpace, onCreateSpace, closeSpace } =
		space;
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
		setSidebarViewMode,
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
	} = useUILayoutContext();
	const {
		aiEnabled,
		aiPanelOpen,
		setAiPanelOpen,
		aiPanelWidth,
		setAiPanelWidth,
	} = useAISidebarContext();
	const { getCurrentMarkdown, saveCurrentEditor } = useEditorContext();

	const [paletteInitialTab, setPaletteInitialTab] = useState<
		"commands" | "search"
	>("commands");
	const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
	const [openAllDocsRequest, setOpenAllDocsRequest] = useState(0);
	const [openTemplatesRequest, setOpenTemplatesRequest] = useState(0);
	const [openCalendarRequest, setOpenCalendarRequest] = useState(0);
	const [openDatabasesRequest, setOpenDatabasesRequest] = useState<{
		nonce: number;
		databaseId: string | null;
	}>({
		nonce: 0,
		databaseId: null,
	});
	const [showGettingStartedRequest, setShowGettingStartedRequest] = useState(0);
	const [dailyNoteSetupNoticeRequest, setDailyNoteSetupNoticeRequest] =
		useState(0);
	const [openBlankTabRequest, setOpenBlankTabRequest] = useState(0);
	const [movePickerSourcePath, setMovePickerSourcePath] = useState<
		string | null
	>(null);
	const [moveTargetDirs, setMoveTargetDirs] = useState<string[]>([]);
	const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
	const [commandPaletteMounted, setCommandPaletteMounted] = useState(false);
	const [shortcutsHelpMounted, setShortcutsHelpMounted] = useState(false);
	const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
	const [templatePickerDirPath, setTemplatePickerDirPath] = useState("");
	const [templatePickerItems, setTemplatePickerItems] = useState<
		TemplatePickerItem[]
	>([]);
	const [htmlExportRequest, setHtmlExportRequest] = useState<{
		id: string;
		relPath: string;
		markdown: string;
		outputPath: string;
	} | null>(null);
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
	const whatsNew = useWhatsNew(space.info?.version ?? null);
	const gitSync = useGitSync({
		spacePath,
		saveCurrentEditor,
	});

	const sidebarResize = useResizablePanel({
		min: SIDEBAR_MIN_WIDTH,
		max: SIDEBAR_MAX_WIDTH,
		disabled: sidebarCollapsed,
		direction: "right",
		onResize: setSidebarWidth,
		currentWidth: sidebarWidth,
	});
	const aiResize = useResizablePanel({
		min: 280,
		max: 700,
		disabled: !aiPanelOpen,
		direction: "left",
		onResize: setAiPanelWidth,
		currentWidth: aiPanelWidth,
	});

	useEffect(() => {
		let cancelled = false;
		const idle = window.setTimeout(() => {
			void loadCommandPalette().then(() => {
				if (!cancelled) setCommandPaletteMounted(true);
			});
			void loadKeyboardShortcutsHelp().then(() => {
				if (!cancelled) setShortcutsHelpMounted(true);
			});
		}, 500);
		return () => {
			cancelled = true;
			window.clearTimeout(idle);
		};
	}, []);

	useEffect(() => {
		if (!zenModeActive) return;
		if (activeMarkdownTabPath) return;
		setZenModeActive(false);
	}, [activeMarkdownTabPath, setZenModeActive, zenModeActive]);

	useEffect(() => {
		if (!paletteOpen) return;
		setCommandPaletteMounted(true);
		void loadCommandPalette();
	}, [paletteOpen]);

	useEffect(() => {
		if (!shortcutsHelpOpen) return;
		setShortcutsHelpMounted(true);
		void loadKeyboardShortcutsHelp();
	}, [shortcutsHelpOpen]);

	const fileTree = useFileTree({
		spacePath,
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
		dragTabId,
		setActiveTabId,
		setDragTabId,
		setDirtyByPath,
		closeTab,
		closeActiveTab,
		closeTabsForPathRemoval,
		renameTabsForPath,
		reorderTabs,
		openBlankTab,
		replaceActiveTabWithBlank,
		openFileTab,
		openSpecialTab,
	} = useTabManager(spacePath);

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

	const { openOrCreateDailyNote } = useDailyNote({
		onOpenFile: (path) => openWorkspaceFile(path),
		setError,
		spacePath,
		templatePath: dailyNoteTemplatePath,
	});

	const openTemplatesSettings = useCallback(() => {
		void openSettingsWindow("space");
	}, []);

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

	const openOrCreateWikiLinkTarget = useCallback(
		async (rawTarget: string) => {
			const targetWithoutAnchor = rawTarget.split("#", 1)[0] ?? rawTarget;
			const normalizedTarget = normalizeRelPath(targetWithoutAnchor);
			if (!normalizedTarget) return;

			const resolved = await invoke("space_resolve_wikilink", {
				target: normalizedTarget,
			});
			if (resolved) {
				await openWorkspaceFile(resolved);
				return;
			}

			const sourceDir = activeMarkdownTabPath
				? parentDir(activeMarkdownTabPath)
				: "";
			const hasExplicitPath = normalizedTarget.includes("/");
			const nextRelPathBase =
				hasExplicitPath || !sourceDir
					? normalizedTarget
					: `${sourceDir}/${normalizedTarget}`;
			const nextRelPath = nextRelPathBase.toLowerCase().endsWith(".md")
				? nextRelPathBase
				: `${nextRelPathBase}.md`;
			const fileName = nextRelPath.split("/").pop() ?? nextRelPath;
			const fileTitle = fileName.replace(/\.md$/i, "") || "Untitled";
			const createdPath = await fileTree.createMarkdownFileAtPath({
				path: nextRelPath,
				text: `# ${fileTitle}\n`,
				openParentDir: parentDir(nextRelPath),
			});
			if (createdPath) {
				await openWorkspaceFile(createdPath);
				return;
			}

			setError("");
			const fallbackResolved = await invoke("space_resolve_wikilink", {
				target: normalizedTarget,
			});
			if (fallbackResolved) {
				await openWorkspaceFile(fallbackResolved);
				return;
			}

			setError(`Could not resolve wikilink: ${rawTarget}`);
		},
		[activeMarkdownTabPath, fileTree, openWorkspaceFile, setError],
	);

	useEffect(() => {
		const onWikiLinkClick = (event: Event) => {
			const detail = (event as CustomEvent<WikiLinkClickDetail>).detail;
			if (!detail?.target) return;
			void (async () => {
				try {
					await openOrCreateWikiLinkTarget(detail.target);
				} catch (e) {
					setError(
						`Failed to open wikilink: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			})();
		};
		const onMarkdownLinkClick = (event: Event) => {
			const detail = (event as CustomEvent<MarkdownLinkClickDetail>).detail;
			if (!detail?.href) return;
			void (async () => {
				try {
					const resolved = await invoke("space_resolve_markdown_link", {
						href: detail.href,
						sourcePath: detail.sourcePath,
					});
					if (resolved) {
						await openWorkspaceFile(resolved);
						return;
					}
					const wikiFallback = await invoke("space_resolve_wikilink", {
						target: detail.href,
					});
					if (wikiFallback) {
						await openWorkspaceFile(wikiFallback);
						return;
					}
					setError(`Could not resolve markdown link: ${detail.href}`);
				} catch (e) {
					setError(
						`Failed to open markdown link: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			})();
		};
		const onTagClick = (event: Event) => {
			const detail = (event as CustomEvent<TagClickDetail>).detail;
			if (!detail?.tag) return;
			setPaletteInitialTab("search");
			setPaletteInitialQuery(
				detail.tag.startsWith("#") ? detail.tag : `#${detail.tag}`,
			);
			setPaletteOpen(true);
		};
		window.addEventListener(WIKI_LINK_CLICK_EVENT, onWikiLinkClick);
		window.addEventListener(MARKDOWN_LINK_CLICK_EVENT, onMarkdownLinkClick);
		window.addEventListener(TAG_CLICK_EVENT, onTagClick);
		return () => {
			window.removeEventListener(WIKI_LINK_CLICK_EVENT, onWikiLinkClick);
			window.removeEventListener(
				MARKDOWN_LINK_CLICK_EVENT,
				onMarkdownLinkClick,
			);
			window.removeEventListener(TAG_CLICK_EVENT, onTagClick);
		};
	}, [openOrCreateWikiLinkTarget, openWorkspaceFile, setError, setPaletteOpen]);

	const openTagSearchPalette = useCallback(
		(tag: string) => {
			setPaletteInitialTab("search");
			setPaletteInitialQuery(tag.startsWith("#") ? tag : `#${tag}`);
			setPaletteOpen(true);
		},
		[setPaletteOpen],
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
		void openSettingsWindow("space");
	}, []);

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
		void openSettingsWindow("ai");
	}, []);

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
	useEffect(
		() => () => {
			if (fsRefreshTimerRef.current !== null)
				window.clearTimeout(fsRefreshTimerRef.current);
		},
		[],
	);

	useEffect(() => {
		const sourcePath = movePickerSourcePath ?? activeFilePath;
		if (!spacePath || !paletteOpen || !sourcePath) {
			setMoveTargetDirs([]);
			return;
		}
		let cancelled = false;
		void (async () => {
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
			if (!cancelled) {
				const fromDir = parentDir(sourcePath);
				setMoveTargetDirs(
					out.filter((d) => d !== fromDir).sort((a, b) => a.localeCompare(b)),
				);
			}
		})().catch(() => {
			if (!cancelled) setMoveTargetDirs([]);
		});
		return () => {
			cancelled = true;
		};
	}, [activeFilePath, movePickerSourcePath, paletteOpen, spacePath]);

	useEffect(() => {
		if (!paletteOpen) setMovePickerSourcePath(null);
	}, [paletteOpen]);

	const openPaletteShortcuts = useMemo<Shortcut[]>(
		() => [
			{ meta: true, key: "k" },
			{ meta: true, shift: true, key: "p" },
		],
		[],
	);
	const openSearchShortcuts = useMemo<Shortcut[]>(
		() => [{ meta: true, key: "f" }],
		[],
	);
	const openCommandPalette = useCallback(() => {
		setPaletteInitialTab("commands");
		setPaletteInitialQuery("");
		setPaletteOpen(true);
		void updateOnboardingSettings({ usedCommandPalette: true });
	}, [setPaletteOpen]);
	const openSearchPalette = useCallback(() => {
		if (!spacePath) {
			openCommandPalette();
			return;
		}
		setPaletteInitialTab("search");
		setPaletteInitialQuery("");
		setPaletteOpen(true);
	}, [setPaletteOpen, spacePath, openCommandPalette]);
	const openAllDocsTab = useCallback(() => {
		setOpenAllDocsRequest((prev) => prev + 1);
	}, []);
	const openTemplatesTab = useCallback(() => {
		setOpenTemplatesRequest((prev) => prev + 1);
	}, []);
	const consumeOpenAllDocsRequest = useCallback(() => {
		setOpenAllDocsRequest(0);
	}, []);
	const consumeOpenTemplatesRequest = useCallback(() => {
		setOpenTemplatesRequest(0);
	}, []);
	const openCalendarTab = useCallback(() => {
		setOpenCalendarRequest((prev) => prev + 1);
	}, []);
	const openDatabasesTab = useCallback((databaseId?: string | null) => {
		setOpenDatabasesRequest((prev) => ({
			nonce: prev.nonce + 1,
			databaseId: databaseId ?? null,
		}));
	}, []);
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
	const openGettingStarted = useCallback(() => {
		setShowGettingStartedRequest((prev) => prev + 1);
	}, []);
	const openWhatsNew = useCallback(() => {
		whatsNew.openDialog();
	}, [whatsNew]);

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
		setSidebarViewMode("files");
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
		setSidebarViewMode,
	]);

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
		onCreateSpace,
		closeSpace,
		onRevealSpace: handleRevealSpaceFromMenu,
		onOpenSpaceSettings: handleOpenSpaceSettings,
		onGitSyncNow: () => {
			void gitSync.syncNow().then(() => {
				toast.success("Git Sync completed.");
			}, handleGitSyncFailure);
		},
		onOpenGitSettings: gitSync.openGitSettings,
		onToggleAiPane: handleToggleAiPaneFromMenu,
		onCloseAiPane: handleCloseAiPaneFromMenu,
		onAttachCurrentNoteToAi: handleAttachCurrentNoteFromMenu,
		onAttachAllOpenNotesToAi: handleAttachAllOpenNotesFromMenu,
		onOpenAiSettings: handleOpenAiSettings,
	});

	const commands = useMemo<Command[]>(() => {
		if (movePickerSourcePath) {
			return [
				{
					id: "move-picker-root",
					label: "/",
					icon: <HugeiconsIcon icon={Folder01Icon} size={16} />,
					category: "Move Destination",
					action: async () => {
						const n = await fileTree.onMovePath(movePickerSourcePath, "");
						if (n) {
							setMovePickerSourcePath(null);
							await openWorkspaceFile(n);
						}
					},
				},
				...moveTargetDirs.map((dir) => ({
					id: `move-picker:${dir}`,
					label: `/${dir}`,
					icon: <HugeiconsIcon icon={Folder01Icon} size={16} />,
					category: "Move Destination",
					action: async () => {
						const n = await fileTree.onMovePath(movePickerSourcePath, dir);
						if (n) {
							setMovePickerSourcePath(null);
							await openWorkspaceFile(n);
						}
					},
				})),
			];
		}
		const aiCommands: Command[] = aiEnabled
			? [
					{
						id: "toggle-ai",
						label: "Toggle AI",
						icon: <HugeiconsIcon icon={AiChat02Icon} size={16} />,
						category: "AI",
						shortcut: { meta: true, shift: true, key: "a" },
						enabled: Boolean(spacePath),
						action: () => setAiPanelOpen((v) => !v),
					},
					{
						id: "ai-attach-current-note",
						label: "AI: Attach current note",
						icon: <HugeiconsIcon icon={Link01Icon} size={16} />,
						category: "AI",
						shortcut: { meta: true, alt: true, key: "a" },
						enabled: Boolean(activeMarkdownTabPath),
						action: () => void attachCurrentNoteToAi(),
					},
					{
						id: "ai-attach-all-open-notes",
						label: "AI: Attach all open notes",
						icon: <HugeiconsIcon icon={Link01Icon} size={16} />,
						category: "AI",
						shortcut: { meta: true, alt: true, shift: true, key: "a" },
						enabled: openMarkdownTabs.length > 0,
						action: () => void attachAllOpenNotesToAi(),
					},
					{
						id: "open-ai-agent",
						label: "Open AI Agent",
						icon: <HugeiconsIcon icon={AiChat02Icon} size={16} />,
						category: "AI",
						enabled: Boolean(spacePath),
						action: () => openSpecialTab(AI_AGENT_TAB_ID),
					},
				]
			: [];

		return [
			{
				id: "open-settings",
				label: "Settings",
				icon: <HugeiconsIcon icon={Settings01Icon} size={16} />,
				category: "Workspace",
				shortcut: { meta: true, key: "," },
				action: () => void openSettingsWindow(),
			},
			{
				id: "open-license-settings",
				label: "Manage license",
				icon: <HugeiconsIcon icon={SquareLock02Icon} size={16} />,
				category: "Workspace",
				action: () => void openSettingsWindow("general"),
			},
			{
				id: "buy-glyph-license",
				label: "Buy Glyph license",
				icon: <HugeiconsIcon icon={SquareLock02Icon} size={16} />,
				category: "Workspace",
				action: async () => {
					try {
						const status = await getLicenseStatus();
						await openUrl(status.purchase_url);
					} catch (error) {
						console.error("Failed to open Gumroad purchase page", error);
						toast.error("Could not open the license page", {
							description:
								error instanceof Error
									? error.message
									: "Try again in a moment.",
						});
					}
				},
			},
			{
				id: "open-space",
				label: "Open space",
				icon: <HugeiconsIcon icon={FolderOpenIcon} size={16} />,
				category: "Workspace",
				shortcut: { meta: true, key: "o" },
				action: onOpenSpace,
			},
			{
				id: "open-git-sync-settings",
				label: "Git Sync settings",
				icon: <HugeiconsIcon icon={Settings01Icon} size={16} />,
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: gitSync.openGitSettings,
			},
			{
				id: "git-sync-now",
				label: "Sync now",
				icon: <HugeiconsIcon icon={Link01Icon} size={16} />,
				category: "Workspace",
				enabled: Boolean(spacePath),
				action: async () => {
					try {
						await gitSync.syncNow();
						toast.success("Git Sync completed.");
					} catch (error) {
						handleGitSyncFailure(error);
					}
				},
			},
			{
				id: "toggle-sidebar",
				label: "Toggle sidebar",
				icon: <HugeiconsIcon icon={SidebarLeftIcon} size={16} />,
				category: "Workspace",
				shortcut: { meta: true, shift: true, key: "b" },
				action: () => setSidebarCollapsed(!sidebarCollapsed),
			},
			{
				id: "toggle-zen-mode",
				label: zenModeActive ? "Exit zen mode" : "Toggle zen mode",
				icon: <HugeiconsIcon icon={Plant01Icon} size={16} />,
				category: "Workspace",
				enabled: Boolean(activeMarkdownTabPath),
				allowInEditable: true,
				action: () => {
					if (zenModeActive) {
						if (activeMarkdownTabPath) {
							dispatchZenModeWillToggle({
								path: activeMarkdownTabPath,
								nextActive: false,
							});
						}
						setZenModeActive(false);
						return;
					}
					if (!activeMarkdownTabPath) return;
					dispatchZenModeWillToggle({
						path: activeMarkdownTabPath,
						nextActive: true,
					});
					dispatchForceNoteEditMode({ path: activeMarkdownTabPath });
					setZenModeActive(true);
				},
			},
			...aiCommands,
			{
				id: "new-note",
				label: "New note",
				icon: <HugeiconsIcon icon={PencilEdit02Icon} size={16} />,
				category: "File Operations",
				shortcut: { meta: true, key: "n" },
				enabled: Boolean(spacePath),
				action: () => void createNoteInSelectedFolder(),
			},
			{
				id: "create-from-template",
				label: "Create from template",
				icon: <HugeiconsIcon icon={ColorsIcon} size={16} />,
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "m" },
				enabled: Boolean(spacePath),
				action: handleCreateFromTemplateFromMenu,
			},
			{
				id: "new-tab",
				label: "New tab",
				icon: <HugeiconsIcon icon={CursorInWindowIcon} size={16} />,
				category: "Navigation",
				shortcut: { meta: true, key: "t" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: () => setOpenBlankTabRequest((prev) => prev + 1),
			},
			{
				id: "new-database",
				label: "New collection",
				icon: <HugeiconsIcon icon={TableIcon} size={16} />,
				category: "File Operations",
				enabled: Boolean(spacePath),
				action: () => void createDatabaseAndOpen(),
			},
			{
				id: "new-folder",
				label: "New folder",
				icon: <HugeiconsIcon icon={Folder01Icon} size={16} />,
				category: "File Operations",
				enabled: Boolean(spacePath),
				action: async () => {
					try {
						const dir =
							activeDirPath ??
							(activeFilePath ? parentDir(activeFilePath) : "");
						await fileTree.onNewFolderInDir(dir);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("Failed to create folder", error);
						setError(message);
						toast.error("Could not create folder", {
							description: message,
						});
					}
				},
			},
			{
				id: "duplicate-current-note",
				label: "Duplicate current note",
				icon: <HugeiconsIcon icon={NoteIcon} size={16} />,
				category: "File Operations",
				enabled:
					activeMarkdownTabPath !== null &&
					isMarkdownPath(activeMarkdownTabPath),
				action: () => void handleDuplicateActiveMarkdown(),
			},
			{
				id: "open-daily-note",
				label: "Open daily note (today)",
				icon: <HugeiconsIcon icon={CalendarAdd01Icon} size={16} />,
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "d" },
				enabled: Boolean(spacePath),
				action: requestOpenDailyNote,
			},
			{
				id: "toggle-pin-active-file",
				label:
					activeFilePath && pinnedFiles.includes(activeFilePath)
						? "Unpin current file"
						: "Pin current file",
				icon: (
					<HugeiconsIcon
						icon={
							activeFilePath && pinnedFiles.includes(activeFilePath)
								? PinOffIcon
								: PinIcon
						}
						size={16}
					/>
				),
				category: "File Operations",
				enabled: Boolean(spacePath) && Boolean(activeFilePath),
				allowInEditable: true,
				action: () => {
					if (!activeFilePath) return;
					void togglePinnedFile(activeFilePath);
				},
			},
			{
				id: "save-note",
				label: "Save",
				icon: <HugeiconsIcon icon={NoteIcon} size={16} />,
				category: "File Operations",
				shortcut: { meta: true, key: "s" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: () => void saveCurrentEditor(),
			},
			{
				id: "copy-note-markdown",
				label: "Copy note as Markdown",
				icon: <HugeiconsIcon icon={NoteIcon} size={16} />,
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "c" },
				enabled: Boolean(activeMarkdownTabPath),
				allowInEditable: true,
				action: () => void handleCopyOpenNoteAsMarkdown(),
			},
			{
				id: "export-note-html",
				label: "Export note as HTML",
				icon: <FileHtml size={16} />,
				category: "File Operations",
				enabled: Boolean(activeMarkdownTabPath),
				action: handleExportHtml,
			},
			{
				id: "close-preview",
				label: "Close preview",
				icon: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
				category: "Navigation",
				shortcut: { meta: true, key: "w" },
				enabled: Boolean(spacePath),
				action: () => setActivePreviewPath(null),
			},
			{
				id: "quick-open",
				label: "Quick open",
				icon: <HugeiconsIcon icon={SearchIcon} size={16} />,
				category: "Navigation",
				shortcut: { meta: true, key: "p" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: openSearchPalette,
			},
			{
				id: "open-all-docs",
				label: "Open all notes",
				icon: <HugeiconsIcon icon={File01Icon} size={16} />,
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openAllDocsTab,
			},
			{
				id: "open-templates",
				label: "Open templates",
				icon: <HugeiconsIcon icon={DocumentCodeIcon} size={16} />,
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openTemplatesTab,
			},
			{
				id: "open-calendar",
				label: "Open calendar",
				icon: <HugeiconsIcon icon={Calendar03Icon} size={16} />,
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openCalendarTab,
			},
			{
				id: "open-dashboard",
				label: "Open home",
				icon: <HugeiconsIcon icon={Home01Icon} size={16} />,
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openCalendarTab,
			},
			{
				id: "open-databases",
				label: "Open collections",
				icon: <HugeiconsIcon icon={LibraryIcon} size={16} />,
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: () => openDatabasesTab(),
			},
			{
				id: "show-getting-started",
				label: "Show getting started",
				icon: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
				category: "Help",
				enabled: Boolean(spacePath),
				action: openGettingStarted,
			},
			{
				id: "show-whats-new",
				label: "What's New",
				icon: <HugeiconsIcon icon={InformationCircleIcon} size={16} />,
				category: "Help",
				enabled: whatsNew.available,
				action: openWhatsNew,
			},
			{
				id: "move-active-file",
				label: "Move to…",
				icon: <HugeiconsIcon icon={MoveIcon} size={16} />,
				category: "File Operations",
				enabled: Boolean(spacePath) && Boolean(activeFilePath),
				action: () => {
					if (!activeFilePath) return;
					setMovePickerSourcePath(activeFilePath);
					setPaletteInitialTab("commands");
					setPaletteInitialQuery("");
					setPaletteOpen(true);
				},
			},
		];
	}, [
		activeMarkdownTabPath,
		activeFilePath,
		pinnedFiles,
		aiEnabled,
		attachAllOpenNotesToAi,
		attachCurrentNoteToAi,
		activeDirPath,
		handleGitSyncFailure,
		handleCopyOpenNoteAsMarkdown,
		handleDuplicateActiveMarkdown,
		handleExportHtml,
		fileTree,
		onOpenSpace,
		openMarkdownTabs.length,
		createDatabaseAndOpen,
		createNoteInSelectedFolder,
		requestOpenDailyNote,
		saveCurrentEditor,
		handleCreateFromTemplateFromMenu,
		setAiPanelOpen,
		togglePinnedFile,
		setPaletteOpen,
		setActivePreviewPath,
		setSidebarCollapsed,
		setZenModeActive,
		sidebarCollapsed,
		spacePath,
		zenModeActive,
		openAllDocsTab,
		openTemplatesTab,
		openSearchPalette,
		openCalendarTab,
		openDatabasesTab,
		openGettingStarted,
		openWorkspaceFile,
		openWhatsNew,
		gitSync,
		moveTargetDirs,
		movePickerSourcePath,
		openSpecialTab,
		setError,
		whatsNew.available,
	]);

	useCommandShortcuts({
		commands,
		paletteOpen,
		onOpenPalette: openCommandPalette,
		onOpenPaletteSearch: openSearchPalette,
		onClosePalette: () => setPaletteOpen(false),
		openPaletteShortcuts,
		openSearchShortcuts,
	});

	return (
		<div
			className={cn(
				"appShell",
				sidebarCollapsed && "appShellSidebarCollapsed",
				aiEnabled && aiPanelOpen && "appShellAiOpen",
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
						title={`Expand sidebar (${getShortcutTooltip({ meta: true, shift: true, key: "b" })})`}
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
				onToggleDir={fileTree.toggleDir}
				onSelectTag={(t) => openTagSearchPalette(t)}
				sidebarCollapsed={sidebarCollapsed}
				onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
				gitSyncStatus={gitSync.status}
				onGitSyncNow={() => {
					void gitSync
						.syncNow()
						.then(() => {
							toast.success("Git Sync completed.");
						})
						.catch(handleGitSyncFailure);
				}}
				onOpenGitSettings={gitSync.openGitSettings}
				onOpenSettings={() => void openSettingsWindow()}
				onOpenAllDocs={openAllDocsTab}
				onOpenDailyNote={requestOpenDailyNote}
				onOpenTemplates={openTemplatesTab}
				onOpenCalendar={openCalendarTab}
				onOpenDatabases={(databaseId) => openDatabasesTab(databaseId)}
				updateReady={autoUpdater.updateReady}
				updateVersion={autoUpdater.updateVersion}
				onInstallUpdate={autoUpdater.installAndRelaunch}
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
				onOpenCommandPalette={openCommandPalette}
				onCreateNote={handleCreateNoteFromStarter}
				onOpenDailyNote={requestOpenDailyNote}
				tabs={tabs}
				activeTabId={activeTabId}
				activeTabPath={activeTabPath}
				dragTabId={dragTabId}
				setActiveTabId={setActiveTabId}
				setDragTabId={setDragTabId}
				setDirtyByPath={setDirtyByPath}
				closeTab={closeTab}
				closeActiveTab={closeActiveTab}
				closeTabsForPathRemoval={closeTabsForPathRemoval}
				renameTabsForPath={renameTabsForPath}
				reorderTabs={reorderTabs}
				openBlankTab={openBlankTab}
				replaceActiveTabWithBlank={replaceActiveTabWithBlank}
				openSpecialTab={openSpecialTab}
				openAllDocsRequest={openAllDocsRequest}
				onConsumeOpenAllDocsRequest={consumeOpenAllDocsRequest}
				openTemplatesRequest={openTemplatesRequest}
				onConsumeOpenTemplatesRequest={consumeOpenTemplatesRequest}
				openCalendarRequest={openCalendarRequest}
				openDatabasesRequest={openDatabasesRequest}
				openBlankTabRequest={openBlankTabRequest}
				showGettingStartedRequest={showGettingStartedRequest}
				dailyNoteSetupNoticeRequest={dailyNoteSetupNoticeRequest}
				onOpenDailyNotesSettings={() => void openSettingsWindow("general")}
			/>
			{spacePath && aiEnabled && aiPanelOpen && !zenModeActive && (
				<div
					ref={aiResize.resizeRef}
					className="sidebarResizeHandle"
					onPointerDown={aiResize.handlePointerDown}
					onPointerMove={aiResize.handlePointerMove}
					onPointerUp={aiResize.handlePointerUp}
					data-window-drag-ignore
					style={{ cursor: "col-resize" }}
				/>
			)}
			{spacePath && aiEnabled && !zenModeActive && (
				<AIFloatingHost
					isOpen={aiPanelOpen}
					onToggle={() => setAiPanelOpen((v) => !v)}
				/>
			)}
			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
			{commandPaletteMounted ? (
				<Suspense fallback={null}>
					<LazyCommandPalette
						key={`${paletteInitialTab}:${paletteInitialQuery}`}
						open={paletteOpen}
						initialTab={paletteInitialTab}
						initialQuery={paletteInitialQuery}
						commands={commands}
						onClose={() => setPaletteOpen(false)}
						spacePath={spacePath}
						onSelectSearchResult={(id) => void openWorkspaceFile(id)}
					/>
				</Suspense>
			) : null}
			{shortcutsHelpMounted ? (
				<Suspense fallback={null}>
					<LazyKeyboardShortcutsHelp
						open={shortcutsHelpOpen}
						onClose={() => setShortcutsHelpOpen(false)}
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
			<WhatsNewDialog
				open={whatsNew.open}
				releaseNotes={whatsNew.releaseNotes}
				publicChangelogUrl={whatsNew.publicChangelogUrl}
				onClose={whatsNew.closeDialog}
			/>
			<NoteExportHtmlHost
				key={htmlExportRequest?.id ?? "idle"}
				request={htmlExportRequest}
				onComplete={({ id, html }) => {
					void handleHtmlExportComplete({ id, html });
				}}
				onError={handleHtmlExportError}
			/>
		</div>
	);
}
