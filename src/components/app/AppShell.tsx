import { cn } from "@/lib/utils";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useAISidebarContext,
	useEditorContext,
	useFileTreeContext,
	useUILayoutContext,
	useVault,
	useViewContext,
} from "../../contexts";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useDailyNote } from "../../hooks/useDailyNote";
import { useFileTree } from "../../hooks/useFileTree";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import type { Shortcut } from "../../lib/shortcuts";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { openSettingsWindow } from "../../lib/windows";
import { onWindowDragMouseDown } from "../../utils/window";
import { PanelLeftOpen } from "../Icons";
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
import { Button } from "../ui/shadcn/button";
import { type Command, CommandPalette } from "./CommandPalette";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";
import { normalizeRelPath, parentDir } from "./appShellHelpers";

export function AppShell() {
	const vault = useVault();
	const { vaultPath, error, setError, onOpenVault, onCreateVault, closeVault } =
		vault;
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
	const { aiPanelOpen, setAiPanelOpen, aiPanelWidth, setAiPanelWidth } =
		useAISidebarContext();
	const { saveCurrentEditor } = useEditorContext();

	const [paletteInitialTab, setPaletteInitialTab] = useState<
		"commands" | "search"
	>("commands");
	const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
	const [openTasksRequest, setOpenTasksRequest] = useState(0);
	const [movePickerSourcePath, setMovePickerSourcePath] = useState<
		string | null
	>(null);
	const [moveTargetDirs, setMoveTargetDirs] = useState<string[]>([]);
	const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

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

	const getActiveFolderDir = useCallback(() => {
		const current = activeViewDocRef.current;
		return current?.kind === "folder" ? current.selector || "" : null;
	}, [activeViewDocRef]);

	const fileTree = useFileTree({
		vaultPath,
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
					const resolved = await invoke("vault_resolve_wikilink", {
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
					const resolved = await invoke("vault_resolve_markdown_link", {
						href: detail.href,
						sourcePath: detail.sourcePath,
					});
					if (resolved) {
						await fileTree.openFile(resolved);
						return;
					}
					const wikiFallback = await invoke("vault_resolve_wikilink", {
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
		[setAiPanelOpen],
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

	useMenuListeners({ onOpenVault, onCreateVault, closeVault });

	const handleVaultFsChanged = useCallback(
		(payload: { rel_path: string }) => {
			if (!vaultPath) return;
			const changedPath = normalizeRelPath(payload.rel_path);
			if (!changedPath) return;
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
		[expandedDirs, fileTree.loadDir, vaultPath],
	);

	useTauriEvent("vault:fs_changed", handleVaultFsChanged);
	useEffect(
		() => () => {
			if (fsRefreshTimerRef.current !== null)
				window.clearTimeout(fsRefreshTimerRef.current);
		},
		[],
	);

	useEffect(() => {
		const sourcePath = movePickerSourcePath ?? activeFilePath;
		if (!vaultPath || !paletteOpen || !sourcePath) {
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
				const entries = await invoke("vault_list_dir", dir ? { dir } : {});
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
	}, [activeFilePath, movePickerSourcePath, paletteOpen, vaultPath]);

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
	}, [setPaletteOpen]);
	const openSearchPalette = useCallback(() => {
		setPaletteInitialTab("search");
		setPaletteInitialQuery("");
		setPaletteOpen(true);
	}, [setPaletteOpen]);
	const openTasksTab = useCallback(() => {
		setOpenTasksRequest((prev) => prev + 1);
	}, []);

	const commands = useMemo<Command[]>(() => {
		if (movePickerSourcePath) {
			return [
				{
					id: "move-picker-root",
					label: "/",
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
		return [
			{
				id: "open-settings",
				label: "Settings",
				shortcut: { meta: true, key: "," },
				action: () => void openSettingsWindow(),
			},
			{
				id: "open-vault",
				label: "Open vault",
				shortcut: { meta: true, key: "o" },
				action: onOpenVault,
			},
			{
				id: "toggle-sidebar",
				label: "Toggle sidebar",
				shortcut: { meta: true, key: "b" },
				action: () => setSidebarCollapsed(!sidebarCollapsed),
			},
			{
				id: "toggle-ai",
				label: "Toggle AI",
				shortcut: { meta: true, shift: true, key: "a" },
				enabled: Boolean(vaultPath),
				action: () => setAiPanelOpen((v) => !v),
			},
			{
				id: "ai-attach-current-note",
				label: "AI: Attach current note",
				shortcut: { meta: true, alt: true, key: "a" },
				enabled: Boolean(activeMarkdownTabPath),
				action: () => void attachCurrentNoteToAi(),
			},
			{
				id: "ai-attach-all-open-notes",
				label: "AI: Attach all open notes",
				shortcut: { meta: true, alt: true, shift: true, key: "a" },
				enabled: openMarkdownTabs.length > 0,
				action: () => void attachAllOpenNotesToAi(),
			},
			{
				id: "new-note",
				label: "New note",
				shortcut: { meta: true, key: "n" },
				enabled: Boolean(vaultPath),
				action: () => void fileTree.onNewFile(),
			},
			{
				id: "open-daily-note",
				label: "Open daily note (today)",
				shortcut: { meta: true, shift: true, key: "d" },
				enabled: Boolean(vaultPath) && Boolean(dailyNotesFolder),
				action: () => void handleOpenDailyNote(),
			},
			{
				id: "save-note",
				label: "Save",
				shortcut: { meta: true, key: "s" },
				enabled: Boolean(vaultPath),
				action: () => void saveCurrentEditor(),
			},
			{
				id: "close-preview",
				label: "Close preview",
				shortcut: { meta: true, key: "w" },
				enabled: Boolean(vaultPath),
				action: () => setActivePreviewPath(null),
			},
			{
				id: "quick-open",
				label: "Quick open",
				shortcut: { meta: true, key: "p" },
				enabled: Boolean(vaultPath),
				action: openSearchPalette,
			},
			{
				id: "open-tasks",
				label: "Open tasks",
				enabled: Boolean(vaultPath),
				action: openTasksTab,
			},
			{
				id: "move-active-file",
				label: "Move to…",
				enabled: Boolean(vaultPath) && Boolean(activeFilePath),
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
		attachAllOpenNotesToAi,
		attachCurrentNoteToAi,
		dailyNotesFolder,
		fileTree,
		handleOpenDailyNote,
		onOpenVault,
		openMarkdownTabs.length,
		saveCurrentEditor,
		setAiPanelOpen,
		setPaletteOpen,
		setActivePreviewPath,
		setSidebarCollapsed,
		sidebarCollapsed,
		vaultPath,
		openSearchPalette,
		openTasksTab,
		moveTargetDirs,
		movePickerSourcePath,
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
				aiPanelOpen && "appShellAiOpen",
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
					<Button
						data-sidebar="trigger"
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Expand sidebar"
						aria-pressed={false}
						data-window-drag-ignore
						onClick={() => setSidebarCollapsed(false)}
						title={`Expand sidebar (${getShortcutTooltip({ meta: true, key: "b" })})`}
					>
						<PanelLeftOpen size={14} />
					</Button>
				</div>
			)}
			<Sidebar
				onSelectDir={(p) => void openFolderView(p)}
				onOpenFile={(p) => void fileTree.openFile(p)}
				onNewFileInDir={(p) => void fileTree.onNewFileInDir(p)}
				onNewFolderInDir={(p) => fileTree.onNewFolderInDir(p)}
				onRenameDir={(p, name) => fileTree.onRenameDir(p, name)}
				onDeletePath={(p, kind) => fileTree.onDeletePath(p, kind)}
				onToggleDir={fileTree.toggleDir}
				onSelectTag={(t) => openTagSearchPalette(t)}
				onOpenCommandPalette={openCommandPalette}
				sidebarCollapsed={sidebarCollapsed}
				onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
				onOpenDailyNote={handleOpenDailyNote}
				isDailyNoteCreating={isDailyNoteCreating}
				onOpenTasks={openTasksTab}
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
				onOpenSearchPalette={openSearchPalette}
				openTasksRequest={openTasksRequest}
			/>
			{vaultPath && aiPanelOpen && (
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
			{vaultPath && (
				<AIFloatingHost
					isOpen={aiPanelOpen}
					onToggle={() => setAiPanelOpen((v) => !v)}
					activeFolderPath={
						activeViewDoc?.kind === "folder"
							? activeViewDoc.selector || ""
							: null
					}
					onAttachContextFiles={attachContextFiles}
				/>
			)}
			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
			<CommandPalette
				key={`${paletteInitialTab}:${paletteInitialQuery}`}
				open={paletteOpen}
				initialTab={paletteInitialTab}
				initialQuery={paletteInitialQuery}
				commands={commands}
				onClose={() => setPaletteOpen(false)}
				vaultPath={vaultPath}
				onSelectSearchNote={(id) => void fileTree.openMarkdownFile(id)}
			/>
			<KeyboardShortcutsHelp
				open={shortcutsHelpOpen}
				onClose={() => setShortcutsHelpOpen(false)}
			/>
		</div>
	);
}
