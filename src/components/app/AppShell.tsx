import { cn } from "@/lib/utils";
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
	useViewContext,
} from "../../contexts";
import { useAutoUpdater } from "../../hooks/useAutoUpdater";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useDailyNote } from "../../hooks/useDailyNote";
import { useFileTree } from "../../hooks/useFileTree";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { dispatchPathRemoved } from "../../lib/appEvents";
import { getLicenseStatus } from "../../lib/license";
import { updateOnboardingSettings } from "../../lib/settings";
import type { Shortcut } from "../../lib/shortcuts";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { openSettingsWindow } from "../../lib/windows";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
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
import type { Command } from "./CommandPalette";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";
import { normalizeRelPath, parentDir } from "./appShellHelpers";

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

export function AppShell() {
	const space = useSpace();
	const { spacePath, error, setError, onOpenSpace, onCreateSpace, closeSpace } =
		space;
	const fileTreeCtx = useFileTreeContext();
	const {
		expandedDirs,
		activeFilePath,
		updateRootEntries,
		updateChildrenByDir,
		updateExpandedDirs,
		setActiveFilePath,
	} = fileTreeCtx;
	const { activeViewDoc, activeViewDocRef, loadAndBuildFolderView } =
		useViewContext();
	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		paletteOpen,
		setPaletteOpen,
		activePreviewPath,
		setActivePreviewPath,
		openMarkdownTabs,
		activeMarkdownTabPath,
		dailyNotesFolder,
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
	const [openTasksRequest, setOpenTasksRequest] = useState(0);
	const [openCalendarRequest, setOpenCalendarRequest] = useState(0);
	const [showGettingStartedRequest, setShowGettingStartedRequest] = useState(0);
	const [movePickerSourcePath, setMovePickerSourcePath] = useState<
		string | null
	>(null);
	const [moveTargetDirs, setMoveTargetDirs] = useState<string[]>([]);
	const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
	const [commandPaletteMounted, setCommandPaletteMounted] = useState(false);
	const [shortcutsHelpMounted, setShortcutsHelpMounted] = useState(false);
	const autoUpdater = useAutoUpdater();

	const sidebarResize = useResizablePanel({
		min: 220,
		max: 600,
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
		if (!paletteOpen) return;
		setCommandPaletteMounted(true);
		void loadCommandPalette();
	}, [paletteOpen]);

	useEffect(() => {
		if (!shortcutsHelpOpen) return;
		setShortcutsHelpMounted(true);
		void loadKeyboardShortcutsHelp();
	}, [shortcutsHelpOpen]);

	const getActiveFolderDir = useCallback(() => {
		const current = activeViewDocRef.current;
		return current?.kind === "folder" ? current.selector || "" : null;
	}, [activeViewDocRef]);

	const fileTree = useFileTree({
		spacePath,
		updateChildrenByDir,
		updateExpandedDirs,
		updateRootEntries,
		setActiveFilePath,
		setActivePreviewPath,
		activeFilePath,
		activePreviewPath,
		setError,
		loadAndBuildFolderView,
		getActiveFolderDir,
	});

	const { openOrCreateDailyNote, isCreating: isDailyNoteCreating } =
		useDailyNote({ onOpenFile: (path) => fileTree.openFile(path), setError });

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

	const fsRefreshQueueRef = useRef<Set<string>>(new Set());
	const fsRefreshTimerRef = useRef<number | null>(null);

	useEffect(() => {
		const onWikiLinkClick = (event: Event) => {
			const detail = (event as CustomEvent<WikiLinkClickDetail>).detail;
			if (!detail?.target) return;
			const targetWithoutAnchor =
				detail.target.split("#", 1)[0] ?? detail.target;
			void (async () => {
				try {
					const resolved = await invoke("space_resolve_wikilink", {
						target: targetWithoutAnchor,
					});
					if (!resolved) {
						setError(`Could not resolve wikilink: ${detail.target}`);
						return;
					}
					await fileTree.openFile(resolved);
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
						await fileTree.openFile(resolved);
						return;
					}
					const wikiFallback = await invoke("space_resolve_wikilink", {
						target: detail.href,
					});
					if (wikiFallback) {
						await fileTree.openFile(wikiFallback);
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
	}, [fileTree, setError, setPaletteOpen]);

	const openFolderView = useCallback(
		async (dir: string) => {
			setActivePreviewPath(null);
			await loadAndBuildFolderView(dir);
		},
		[loadAndBuildFolderView, setActivePreviewPath],
	);
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

	const handleNewNoteFromMenu = useCallback(() => {
		if (!spacePath) return;
		void fileTree.onNewFile();
	}, [fileTree, spacePath]);

	const handleOpenDailyNoteFromMenu = useCallback(() => {
		if (!spacePath || !dailyNotesFolder) return;
		void handleOpenDailyNote();
	}, [dailyNotesFolder, handleOpenDailyNote, spacePath]);

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

	useMenuListeners({
		onNewNote: handleNewNoteFromMenu,
		onOpenDailyNote: handleOpenDailyNoteFromMenu,
		onSaveNote: handleSaveNoteFromMenu,
		onCloseTab: () => {
			window.dispatchEvent(new Event("glyph:close-active-tab"));
		},
		onOpenSpace,
		onCreateSpace,
		closeSpace,
		onRevealSpace: handleRevealSpaceFromMenu,
		onOpenSpaceSettings: handleOpenSpaceSettings,
		onToggleAiPane: handleToggleAiPaneFromMenu,
		onCloseAiPane: handleCloseAiPaneFromMenu,
		onAttachCurrentNoteToAi: handleAttachCurrentNoteFromMenu,
		onAttachAllOpenNotesToAi: handleAttachAllOpenNotesFromMenu,
		onOpenAiSettings: handleOpenAiSettings,
	});

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
		setPaletteInitialTab("search");
		setPaletteInitialQuery("");
		setPaletteOpen(true);
	}, [setPaletteOpen]);
	const openTasksTab = useCallback(() => {
		setOpenTasksRequest((prev) => prev + 1);
	}, []);

	const openCalendarTab = useCallback(() => {
		setOpenCalendarRequest((prev) => prev + 1);
	}, []);
	const openGettingStarted = useCallback(() => {
		setShowGettingStartedRequest((prev) => prev + 1);
	}, []);

	const handleCreateNoteFromStarter = useCallback(async () => {
		if (!spacePath) return;
		const createdPath = await fileTree.onNewFile();
		if (createdPath) {
			await fileTree.openFile(createdPath);
		}
	}, [fileTree, spacePath]);

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

	const commands = useMemo<Command[]>(() => {
		if (movePickerSourcePath) {
			return [
				{
					id: "move-picker-root",
					label: "/",
					category: "Move Destination",
					action: async () => {
						const n = await fileTree.onMovePath(movePickerSourcePath, "");
						if (n) {
							setMovePickerSourcePath(null);
							await fileTree.openFile(n);
						}
					},
				},
				...moveTargetDirs.map((dir) => ({
					id: `move-picker:${dir}`,
					label: `/${dir}`,
					category: "Move Destination",
					action: async () => {
						const n = await fileTree.onMovePath(movePickerSourcePath, dir);
						if (n) {
							setMovePickerSourcePath(null);
							await fileTree.openFile(n);
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
						category: "AI",
						shortcut: { meta: true, shift: true, key: "a" },
						enabled: Boolean(spacePath),
						action: () => setAiPanelOpen((v) => !v),
					},
					{
						id: "ai-attach-current-note",
						label: "AI: Attach current note",
						category: "AI",
						shortcut: { meta: true, alt: true, key: "a" },
						enabled: Boolean(activeMarkdownTabPath),
						action: () => void attachCurrentNoteToAi(),
					},
					{
						id: "ai-attach-all-open-notes",
						label: "AI: Attach all open notes",
						category: "AI",
						shortcut: { meta: true, alt: true, shift: true, key: "a" },
						enabled: openMarkdownTabs.length > 0,
						action: () => void attachAllOpenNotesToAi(),
					},
				]
			: [];

		return [
			{
				id: "open-settings",
				label: "Settings",
				category: "Workspace",
				shortcut: { meta: true, key: "," },
				action: () => void openSettingsWindow(),
			},
			{
				id: "open-license-settings",
				label: "Manage license",
				category: "Workspace",
				action: () => void openSettingsWindow("general"),
			},
			{
				id: "buy-glyph-license",
				label: "Buy Glyph license",
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
				category: "Workspace",
				shortcut: { meta: true, key: "o" },
				action: onOpenSpace,
			},
			{
				id: "toggle-sidebar",
				label: "Toggle sidebar",
				category: "Workspace",
				shortcut: { meta: true, key: "b" },
				action: () => setSidebarCollapsed(!sidebarCollapsed),
			},
			...aiCommands,
			{
				id: "new-note",
				label: "New note",
				category: "File Operations",
				shortcut: { meta: true, key: "n" },
				enabled: Boolean(spacePath),
				action: () => void fileTree.onNewFile(),
			},
			{
				id: "new-database",
				label: "New database",
				category: "File Operations",
				enabled: Boolean(spacePath),
				action: async () => {
					try {
						const dir = getActiveFolderDir() ?? "";
						const path = await fileTree.onNewDatabaseInDir(dir);
						if (path) {
							await fileTree.openFile(path);
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("Failed to create database note", error);
						setError(message);
						toast.error("Could not create database", {
							description: message,
						});
					}
				},
			},
			{
				id: "open-daily-note",
				label: "Open daily note (today)",
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "d" },
				enabled: Boolean(spacePath) && Boolean(dailyNotesFolder),
				action: () => void handleOpenDailyNote(),
			},
			{
				id: "save-note",
				label: "Save",
				category: "File Operations",
				shortcut: { meta: true, key: "s" },
				enabled: Boolean(spacePath),
				allowInEditable: true,
				action: () => void saveCurrentEditor(),
			},
			{
				id: "copy-note-markdown",
				label: "Copy note as Markdown",
				category: "File Operations",
				shortcut: { meta: true, shift: true, key: "c" },
				enabled: Boolean(activeMarkdownTabPath),
				allowInEditable: true,
				action: () => void handleCopyOpenNoteAsMarkdown(),
			},
			{
				id: "close-preview",
				label: "Close preview",
				category: "Navigation",
				shortcut: { meta: true, key: "w" },
				enabled: Boolean(spacePath),
				action: () => setActivePreviewPath(null),
			},
			{
				id: "quick-open",
				label: "Quick open",
				category: "Navigation",
				shortcut: { meta: true, key: "p" },
				enabled: Boolean(spacePath),
				action: openSearchPalette,
			},
			{
				id: "open-tasks",
				label: "Open tasks",
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openTasksTab,
			},
			{
				id: "open-calendar",
				label: "Open calendar",
				category: "Navigation",
				enabled: Boolean(spacePath),
				action: openCalendarTab,
			},
			{
				id: "show-getting-started",
				label: "Show getting started",
				category: "Help",
				enabled: Boolean(spacePath),
				action: openGettingStarted,
			},
			{
				id: "move-active-file",
				label: "Move to…",
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
		aiEnabled,
		attachAllOpenNotesToAi,
		attachCurrentNoteToAi,
		handleCopyOpenNoteAsMarkdown,
		dailyNotesFolder,
		fileTree,
		handleOpenDailyNote,
		onOpenSpace,
		openMarkdownTabs.length,
		saveCurrentEditor,
		setAiPanelOpen,
		setPaletteOpen,
		setActivePreviewPath,
		setSidebarCollapsed,
		sidebarCollapsed,
		spacePath,
		openSearchPalette,
		openTasksTab,
		openCalendarTab,
		openGettingStarted,
		moveTargetDirs,
		movePickerSourcePath,
		getActiveFolderDir,
		setError,
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
			)}
		>
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			{sidebarCollapsed && (
				<div className="sidebarCollapsedToggle">
					<WindowChromeIconButton
						ariaLabel="Expand sidebar"
						ariaPressed={false}
						onClick={() => setSidebarCollapsed(false)}
						title={`Expand sidebar (${getShortcutTooltip({ meta: true, key: "b" })})`}
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
				onSelectDir={(p) => void openFolderView(p)}
				onOpenFile={(p) => void fileTree.openFile(p)}
				onNewFileInDir={(p) => void fileTree.onNewFileInDir(p)}
				onNewDatabaseInDir={(p) =>
					fileTree
						.onNewDatabaseInDir(p)
						.then(async (path) => {
							if (path) {
								await fileTree.openFile(path);
							}
							return path;
						})
						.catch((error) => {
							const message =
								error instanceof Error ? error.message : String(error);
							console.error(
								"Failed to create database note in directory",
								error,
							);
							setError(message);
							toast.error("Could not create database", {
								description: message,
							});
							return null;
						})
				}
				onNewFolderInDir={(p) => fileTree.onNewFolderInDir(p)}
				onRenameDir={(p, name) => fileTree.onRenameDir(p, name)}
				onDeletePath={(p, kind) => fileTree.onDeletePath(p, kind)}
				onToggleDir={fileTree.toggleDir}
				onSelectTag={(t) => openTagSearchPalette(t)}
				sidebarCollapsed={sidebarCollapsed}
				onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
				onOpenDailyNote={handleOpenDailyNote}
				isDailyNoteCreating={isDailyNoteCreating}
				onOpenTasks={openTasksTab}
				onOpenCalendar={openCalendarTab}
				updateReady={autoUpdater.updateReady}
				updateVersion={autoUpdater.updateVersion}
				onInstallUpdate={autoUpdater.installAndRelaunch}
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
			<MainContent
				fileTree={fileTree}
				onOpenCommandPalette={openCommandPalette}
				onCreateNote={handleCreateNoteFromStarter}
				onOpenDailyNote={handleOpenDailyNote}
				onOpenTasks={openTasksTab}
				openTasksRequest={openTasksRequest}
				openCalendarRequest={openCalendarRequest}
				showGettingStartedRequest={showGettingStartedRequest}
			/>
			{spacePath && aiEnabled && aiPanelOpen && (
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
			{spacePath && aiEnabled && (
				<AIFloatingHost
					isOpen={aiPanelOpen}
					onToggle={() => setAiPanelOpen((v) => !v)}
					activeFolderPath={
						activeViewDoc?.kind === "folder"
							? activeViewDoc.selector || ""
							: null
					}
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
						onSelectSearchResult={(id) => void fileTree.openFile(id)}
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
		</div>
	);
}
