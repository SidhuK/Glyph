import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useEditorContext,
	useFileTreeContext,
	useUIContext,
	useVault,
	useViewContext,
} from "../../contexts";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useDailyNote } from "../../hooks/useDailyNote";
import { useFileTree } from "../../hooks/useFileTree";

import { useMenuListeners } from "../../hooks/useMenuListeners";
import type { Shortcut } from "../../lib/shortcuts";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { type FsEntry, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { openSettingsWindow } from "../../lib/windows";
import { cn } from "../../utils/cn";
import { onWindowDragMouseDown } from "../../utils/window";
import { PanelLeftOpen } from "../Icons";
import { AIFloatingHost } from "../ai/AIFloatingHost";
import { dispatchAiContextAttach } from "../ai/aiContextEvents";
import {
	WIKI_LINK_CLICK_EVENT,
	type WikiLinkClickDetail,
} from "../editor/markdown/wikiLinkEvents";
import { Button } from "../ui/shadcn/button";
import { type Command, CommandPalette } from "./CommandPalette";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";

function basename(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

function fileTitleFromPath(path: string): string {
	return basename(path).replace(/\.md$/i, "").trim() || "Untitled";
}

function normalizeWikiLinkTarget(target: string): string {
	return target.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function resolveWikiLinkPath(
	target: string,
	entries: FsEntry[],
): string | null {
	const normalized = normalizeWikiLinkTarget(target).replace(/\.md$/i, "");
	if (!normalized) return null;
	const lowered = normalized.toLowerCase();

	const exactPath = entries.find(
		(entry) => entry.rel_path.replace(/\.md$/i, "").toLowerCase() === lowered,
	);
	if (exactPath) return exactPath.rel_path;

	const exactTitle = entries.find((entry) => {
		const title = fileTitleFromPath(entry.rel_path).toLowerCase();
		return title === lowered;
	});
	if (exactTitle) return exactTitle.rel_path;

	const suffixPath = entries.find((entry) =>
		entry.rel_path.replace(/\.md$/i, "").toLowerCase().endsWith(`/${lowered}`),
	);
	return suffixPath?.rel_path ?? null;
}

function aiNoteFileName(): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, "0");
	return `AI Note ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
		now.getDate(),
	)} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(
		now.getSeconds(),
	)}.md`;
}

function normalizeRelPath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "")
		.trim();
}

function parentDir(path: string): string {
	const normalized = normalizeRelPath(path);
	const idx = normalized.lastIndexOf("/");
	if (idx < 0) return "";
	return normalized.slice(0, idx);
}

export function AppShell() {
	// ---------------------------------------------------------------------------
	// Contexts
	// ---------------------------------------------------------------------------
	const vault = useVault();
	const { vaultPath, error, setError, onOpenVault, onCreateVault, closeVault } =
		vault;

	const fileTreeCtx = useFileTreeContext();
	const {
		expandedDirs,
		setRootEntries,
		setChildrenByDir,
		setExpandedDirs,
		setActiveFilePath,
	} = fileTreeCtx;

	const { activeViewDoc, activeViewDocRef, loadAndBuildFolderView } =
		useViewContext();

	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		paletteOpen,
		setPaletteOpen,
		aiPanelOpen,
		setAiPanelOpen,
		setActivePreviewPath,
		openMarkdownTabs,
		activeMarkdownTabPath,
		dailyNotesFolder,
	} = useUIContext();

	const { saveCurrentEditor } = useEditorContext();

	// ---------------------------------------------------------------------------
	// Local state
	// ---------------------------------------------------------------------------
	const [paletteInitialTab, setPaletteInitialTab] = useState<
		"commands" | "search"
	>("commands");
	const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
	const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
	const resizeRef = useRef<HTMLDivElement>(null);
	const dragStartXRef = useRef(0);
	const dragStartWidthRef = useRef(0);
	const isDraggingRef = useRef(false);

	const { sidebarWidth, setSidebarWidth, aiPanelWidth, setAiPanelWidth } =
		useUIContext();

	const handleResizeStart = useCallback(
		(e: React.PointerEvent) => {
			if (sidebarCollapsed) return;
			isDraggingRef.current = true;
			dragStartXRef.current = e.clientX;
			dragStartWidthRef.current = sidebarWidth;
			if (resizeRef.current) {
				resizeRef.current.setPointerCapture(e.pointerId);
			}
		},
		[sidebarCollapsed, sidebarWidth],
	);

	const handleResizeMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDraggingRef.current) return;
			const delta = e.clientX - dragStartXRef.current;
			const newWidth = Math.max(
				220,
				Math.min(600, dragStartWidthRef.current + delta),
			);
			setSidebarWidth(newWidth);
		},
		[setSidebarWidth],
	);

	const handleResizeEnd = useCallback(() => {
		isDraggingRef.current = false;
	}, []);

	useEffect(() => {
		const handleGlobalMove = (e: PointerEvent) => {
			if (!isDraggingRef.current) return;
			const delta = e.clientX - dragStartXRef.current;
			const newWidth = Math.max(
				220,
				Math.min(600, dragStartWidthRef.current + delta),
			);
			setSidebarWidth(newWidth);
		};

		const handleGlobalEnd = () => {
			isDraggingRef.current = false;
		};

		if (isDraggingRef.current) {
			window.addEventListener("pointermove", handleGlobalMove);
			window.addEventListener("pointerup", handleGlobalEnd);
			return () => {
				window.removeEventListener("pointermove", handleGlobalMove);
				window.removeEventListener("pointerup", handleGlobalEnd);
			};
		}
	}, [setSidebarWidth]);

	// AI panel resize (mirrored: drag left = wider)
	const aiResizeRef = useRef<HTMLDivElement>(null);
	const aiDragStartXRef = useRef(0);
	const aiDragStartWidthRef = useRef(0);
	const aiIsDraggingRef = useRef(false);

	const handleAiResizeStart = useCallback(
		(e: React.PointerEvent) => {
			if (!aiPanelOpen) return;
			aiIsDraggingRef.current = true;
			aiDragStartXRef.current = e.clientX;
			aiDragStartWidthRef.current = aiPanelWidth;
			if (aiResizeRef.current) {
				aiResizeRef.current.setPointerCapture(e.pointerId);
			}
		},
		[aiPanelOpen, aiPanelWidth],
	);

	const handleAiResizeMove = useCallback(
		(e: React.PointerEvent) => {
			if (!aiIsDraggingRef.current) return;
			const delta = aiDragStartXRef.current - e.clientX;
			const newWidth = Math.max(
				280,
				Math.min(700, aiDragStartWidthRef.current + delta),
			);
			setAiPanelWidth(newWidth);
		},
		[setAiPanelWidth],
	);

	const handleAiResizeEnd = useCallback(() => {
		aiIsDraggingRef.current = false;
	}, []);

	useEffect(() => {
		const handleGlobalMove = (e: PointerEvent) => {
			if (!aiIsDraggingRef.current) return;
			const delta = aiDragStartXRef.current - e.clientX;
			const newWidth = Math.max(
				280,
				Math.min(700, aiDragStartWidthRef.current + delta),
			);
			setAiPanelWidth(newWidth);
		};

		const handleGlobalEnd = () => {
			aiIsDraggingRef.current = false;
		};

		if (aiIsDraggingRef.current) {
			window.addEventListener("pointermove", handleGlobalMove);
			window.addEventListener("pointerup", handleGlobalEnd);
			return () => {
				window.removeEventListener("pointermove", handleGlobalMove);
				window.removeEventListener("pointerup", handleGlobalEnd);
			};
		}
	}, [setAiPanelWidth]);

	// ---------------------------------------------------------------------------
	// Derived callbacks
	// ---------------------------------------------------------------------------
	const getActiveFolderDir = useCallback(() => {
		const current = activeViewDocRef.current;
		if (!current || current.kind !== "folder") return null;
		return current.selector || "";
	}, [activeViewDocRef]);

	const fileTree = useFileTree({
		vaultPath,
		setChildrenByDir,
		setExpandedDirs,
		setRootEntries,
		setActiveFilePath,
		setActivePreviewPath,
		setError,
		loadAndBuildFolderView,
		getActiveFolderDir,
	});
	const { loadDir } = fileTree;

	const { openOrCreateDailyNote, isCreating: isDailyNoteCreating } =
		useDailyNote({
			onOpenFile: (path) => fileTree.openFile(path),
			setError,
		});

	const handleOpenDailyNote = useCallback(async () => {
		if (!dailyNotesFolder) {
			return;
		}
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
		let cachedEntries: FsEntry[] = [];
		let loadedAt = 0;
		const ensureEntries = async () => {
			const now = Date.now();
			if (!cachedEntries.length || now - loadedAt > 30_000) {
				cachedEntries = await invoke("vault_list_markdown_files", {
					recursive: true,
					limit: 4000,
				});
				loadedAt = now;
			}
			return cachedEntries;
		};

		const onWikiLinkClick = (event: Event) => {
			const detail = (event as CustomEvent<WikiLinkClickDetail>).detail;
			if (!detail?.target) return;
			const targetWithoutAnchor =
				detail.target.split("#", 1)[0] ?? detail.target;
			void (async () => {
				try {
					const entries = await ensureEntries();
					const resolved = resolveWikiLinkPath(targetWithoutAnchor, entries);
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

		window.addEventListener(WIKI_LINK_CLICK_EVENT, onWikiLinkClick);
		return () => {
			window.removeEventListener(WIKI_LINK_CLICK_EVENT, onWikiLinkClick);
		};
	}, [fileTree, setError]);

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
						.map((path) => path.trim())
						.filter((path) => path.toLowerCase().endsWith(".md")),
				),
			);
			if (unique.length === 0) return;
			setAiPanelOpen(true);
			window.setTimeout(() => {
				dispatchAiContextAttach({ paths: unique });
			}, 0);
		},
		[setAiPanelOpen],
	);

	const attachCurrentNoteToAi = useCallback(async () => {
		const target = activeMarkdownTabPath;
		if (!target) {
			setError("No open markdown note to attach to AI.");
			return;
		}
		await attachContextFiles([target]);
	}, [activeMarkdownTabPath, attachContextFiles, setError]);

	const attachAllOpenNotesToAi = useCallback(async () => {
		const markdownTabs = openMarkdownTabs.filter((path) =>
			path.toLowerCase().endsWith(".md"),
		);
		if (markdownTabs.length === 0) {
			setError("No open markdown notes to attach to AI.");
			return;
		}
		await attachContextFiles(markdownTabs);
	}, [attachContextFiles, openMarkdownTabs, setError]);

	const createNoteFromAI = useCallback(
		async (markdown: string) => {
			const text = markdown.trim();
			if (!text) return;
			const dir =
				activeViewDoc?.kind === "folder" ? activeViewDoc.selector : "";
			const baseName = aiNoteFileName();
			let filePath = dir ? `${dir}/${baseName}` : baseName;
			let suffix = 2;
			while (true) {
				try {
					await invoke("vault_read_text", { path: filePath });
					const nextName = baseName.replace(
						/\.md$/i,
						` ${suffix.toString()}.md`,
					);
					filePath = dir ? `${dir}/${nextName}` : nextName;
					suffix += 1;
				} catch {
					break;
				}
			}
			const title = fileTitleFromPath(filePath);
			const body = text.startsWith("# ") ? text : `# ${title}\n\n${text}`;
			await invoke("vault_write_text", {
				path: filePath,
				text: body,
				base_mtime_ms: null,
			});
			await fileTree.openFile(filePath);
		},
		[activeViewDoc, fileTree],
	);

	// ---------------------------------------------------------------------------
	// Menu listeners
	// ---------------------------------------------------------------------------
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
				if (changed.length === 0) return;

				const dirsToRefresh = new Set<string>([""]);
				for (const relPath of changed) {
					dirsToRefresh.add(parentDir(relPath));
					if (expandedDirs.has(relPath)) {
						dirsToRefresh.add(relPath);
					}
				}

				for (const dir of dirsToRefresh) {
					void loadDir(dir, true);
				}
			}, 150);
		},
		[expandedDirs, loadDir, vaultPath],
	);

	useTauriEvent("vault:fs_changed", handleVaultFsChanged);

	useEffect(
		() => () => {
			if (fsRefreshTimerRef.current !== null) {
				window.clearTimeout(fsRefreshTimerRef.current);
			}
		},
		[],
	);

	// ---------------------------------------------------------------------------
	// Commands
	// ---------------------------------------------------------------------------
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

	const commands = useMemo<Command[]>(
		() => [
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
				action: () => {
					setPaletteInitialTab("search");
					setPaletteInitialQuery("");
					setPaletteOpen(true);
				},
			},
		],
		[
			activeMarkdownTabPath,
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
		],
	);

	useCommandShortcuts({
		commands,
		paletteOpen,
		onOpenPalette: () => {
			setPaletteInitialTab("commands");
			setPaletteInitialQuery("");
			setPaletteOpen(true);
		},
		onOpenPaletteSearch: () => {
			setPaletteInitialTab("search");
			setPaletteInitialQuery("");
			setPaletteOpen(true);
		},
		onClosePalette: () => setPaletteOpen(false),
		openPaletteShortcuts,
		openSearchShortcuts,
	});

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------
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
				onToggleDir={fileTree.toggleDir}
				onSelectTag={(t) => openTagSearchPalette(t)}
				onOpenCommandPalette={() => {
					setPaletteInitialTab("commands");
					setPaletteInitialQuery("");
					setPaletteOpen(true);
				}}
				sidebarCollapsed={sidebarCollapsed}
				onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
				onOpenDailyNote={handleOpenDailyNote}
				isDailyNoteCreating={isDailyNoteCreating}
			/>

			<div
				ref={resizeRef}
				className="sidebarResizeHandle"
				onPointerDown={handleResizeStart}
				onPointerMove={handleResizeMove}
				onPointerUp={handleResizeEnd}
				data-window-drag-ignore
				style={{ cursor: sidebarCollapsed ? "default" : "col-resize" }}
			/>

			<MainContent fileTree={fileTree} />

			{vaultPath && aiPanelOpen && (
				<div
					ref={aiResizeRef}
					className="sidebarResizeHandle"
					onPointerDown={handleAiResizeStart}
					onPointerMove={handleAiResizeMove}
					onPointerUp={handleAiResizeEnd}
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
					onCreateNoteFromLastAssistant={createNoteFromAI}
				/>
			)}

			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
			<CommandPalette
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
