import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useFileTreeContext,
	useUIContext,
	useVault,
	useViewContext,
} from "../../contexts";
import { useCanvasLibrary } from "../../hooks/useCanvasLibrary";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useFileTree } from "../../hooks/useFileTree";

import { useMenuListeners } from "../../hooks/useMenuListeners";
import { parseNotePreview } from "../../lib/notePreview";
import type { Shortcut } from "../../lib/shortcuts";
import { type FsEntry, invoke } from "../../lib/tauri";
import { cn } from "../../utils/cn";
import { isMarkdownPath } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import type { CanvasExternalCommand } from "../CanvasPane";
import { PanelLeftClose, PanelLeftOpen } from "../Icons";
import { AIFloatingHost } from "../ai/AIFloatingHost";
import {
	WIKI_LINK_CLICK_EVENT,
	type WikiLinkClickDetail,
} from "../editor/markdown/wikiLinkEvents";
import { Button } from "../ui/shadcn/button";
import { type Command, CommandPalette } from "./CommandPalette";
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

export function AppShell() {
	// ---------------------------------------------------------------------------
	// Contexts
	// ---------------------------------------------------------------------------
	const vault = useVault();
	const { vaultPath, error, setError, onOpenVault, onCreateVault, closeVault } =
		vault;

	const fileTreeCtx = useFileTreeContext();
	const {
		setRootEntries,
		setChildrenByDir,
		setDirSummariesByParent,
		setExpandedDirs,
		setActiveFilePath,
	} = fileTreeCtx;

	const {
		activeViewDoc,
		activeViewDocRef,
		loadAndBuildFolderView,
		loadAndBuildTagView,
		loadCanvasView,
		setActiveViewDoc,
	} = useViewContext();

	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		paletteOpen,
		setPaletteOpen,
		aiPanelOpen,
		setAiPanelOpen,
		setActivePreviewPath,
	} = useUIContext();

	// ---------------------------------------------------------------------------
	// Local state
	// ---------------------------------------------------------------------------
	const [paletteInitialTab, setPaletteInitialTab] = useState<
		"commands" | "search"
	>("commands");
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);
	const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
	const resizeRef = useRef<HTMLDivElement>(null);
	const dragStartXRef = useRef(0);
	const dragStartWidthRef = useRef(0);
	const isDraggingRef = useRef(false);

	const { sidebarWidth, setSidebarWidth } = useUIContext();

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

	useEffect(() => {
		if (activeViewDoc?.kind !== "canvas") return;
		setSelectedCanvasId(activeViewDoc.selector);
	}, [activeViewDoc]);

	// ---------------------------------------------------------------------------
	// Derived callbacks
	// ---------------------------------------------------------------------------
	const getActiveFolderDir = useCallback(() => {
		const current = activeViewDocRef.current;
		if (!current || current.kind !== "folder") return null;
		return current.selector || "";
	}, [activeViewDocRef]);

	const setCanvasCommandForFileTree = useCallback(
		(
			cmd: { id: string; kind: string; noteId?: string; title?: string } | null,
		) => {
			setCanvasCommand(cmd as CanvasExternalCommand | null);
		},
		[],
	);

	const fileTree = useFileTree({
		vaultPath,
		setChildrenByDir,
		setDirSummariesByParent,
		setExpandedDirs,
		setRootEntries,
		setActiveFilePath,
		setActivePreviewPath,
		setCanvasCommand: setCanvasCommandForFileTree,
		setError,
		loadAndBuildFolderView,
		getActiveFolderDir,
	});

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

	const canvasLibrary = useCanvasLibrary();

	const openFolderView = useCallback(
		async (dir: string) => {
			setActivePreviewPath(null);
			await loadAndBuildFolderView(dir);
		},
		[loadAndBuildFolderView, setActivePreviewPath],
	);

	const openTagView = useCallback(
		async (tag: string) => {
			setActivePreviewPath(null);
			await loadAndBuildTagView(tag);
		},
		[loadAndBuildTagView, setActivePreviewPath],
	);

	const openCanvas = useCallback(
		async (id: string) => {
			setSelectedCanvasId(id);
			setActivePreviewPath(null);
			await loadCanvasView(id);
		},
		[loadCanvasView, setActivePreviewPath],
	);

	const createCanvasAndOpen = useCallback(async () => {
		const created = await canvasLibrary.createCanvas("Canvas", "manual");
		await openCanvas(created.meta.id);
	}, [canvasLibrary, openCanvas]);

	const renameCanvasAndUpdate = useCallback(
		async (id: string, title: string) => {
			const nextTitle = title.trim();
			if (!nextTitle) return;
			await canvasLibrary.renameCanvas(id, nextTitle);
			if (activeViewDoc?.kind === "canvas" && activeViewDoc.selector === id) {
				setActiveViewDoc({ ...activeViewDoc, title: nextTitle });
			}
		},
		[activeViewDoc, canvasLibrary, setActiveViewDoc],
	);

	const dispatchCanvasCommand = useCallback(
		async (command: CanvasExternalCommand) => {
			await new Promise<void>((resolve) => {
				window.requestAnimationFrame(() => resolve());
			});
			setCanvasCommand(command);
		},
		[],
	);

	const ensureCanvasTarget = useCallback(
		async (source: "manual") => {
			if (activeViewDoc?.kind === "canvas") return activeViewDoc.selector;
			if (selectedCanvasId) {
				await openCanvas(selectedCanvasId);
				return selectedCanvasId;
			}
			const created = await canvasLibrary.createCanvas("Canvas", source);
			setSelectedCanvasId(created.meta.id);
			await openCanvas(created.meta.id);
			return created.meta.id;
		},
		[activeViewDoc, canvasLibrary, openCanvas, selectedCanvasId],
	);

	const addBatchToCanvas = useCallback(
		async (
			source: "manual",
			nodes: Extract<
				CanvasExternalCommand,
				{ kind: "add_nodes_batch" }
			>["nodes"],
		) => {
			if (!nodes.length) return;
			await ensureCanvasTarget(source);
			await dispatchCanvasCommand({
				id: crypto.randomUUID(),
				kind: "add_nodes_batch",
				nodes,
			});
		},
		[dispatchCanvasCommand, ensureCanvasTarget],
	);

	const addNotesToCanvas = useCallback(
		async (paths: string[]) => {
			const notePaths = paths.filter((path) => isMarkdownPath(path));
			if (!notePaths.length) return;
			const docs = await invoke("vault_read_texts_batch", { paths: notePaths });
			const byPath = new Map(docs.map((doc) => [doc.rel_path, doc] as const));
			await addBatchToCanvas(
				"manual",
				notePaths.map((path) => {
					const markdown = byPath.get(path)?.text ?? "";
					const preview = markdown
						? parseNotePreview(path, markdown)
						: { title: fileTitleFromPath(path), content: "" };
					return {
						kind: "note" as const,
						noteId: path,
						title: preview.title,
						content: preview.content,
					};
				}),
			);
		},
		[addBatchToCanvas],
	);

	const createNewCanvasNote = useCallback(async () => {
		if (!vaultPath) return;
		const titleInput = window.prompt("New note title:", "Untitled Note");
		if (titleInput == null) return;
		const title = titleInput.trim() || "Untitled Note";
		const activeDir =
			activeViewDoc?.kind === "folder" ? activeViewDoc.selector || "" : "";
		const safeBase =
			title.replace(/[\\/:*?\"<>|]+/g, " ").trim() || "Untitled Note";
		let notePath = activeDir ? `${activeDir}/${safeBase}.md` : `${safeBase}.md`;
		let suffix = 2;
		while (true) {
			try {
				await invoke("vault_read_text", { path: notePath });
				notePath = activeDir
					? `${activeDir}/${safeBase} ${suffix.toString()}.md`
					: `${safeBase} ${suffix.toString()}.md`;
				suffix += 1;
			} catch {
				break;
			}
		}
		const body = `# ${title}\n\n`;
		await invoke("vault_write_text", {
			path: notePath,
			text: body,
			base_mtime_ms: null,
		});
		const preview = parseNotePreview(notePath, body);
		await addBatchToCanvas("manual", [
			{
				kind: "note",
				noteId: notePath,
				title: preview.title,
				content: preview.content,
			},
		]);
	}, [activeViewDoc, addBatchToCanvas, vaultPath]);

	const addAttachmentsToCanvas = useCallback(
		async (paths: string[]) => {
			await addBatchToCanvas(
				"manual",
				paths.map((path) => ({
					kind: "file",
					path,
					title: basename(path),
				})),
			);
		},
		[addBatchToCanvas],
	);

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
			const preview = parseNotePreview(filePath, body);
			await addBatchToCanvas("manual", [
				{
					kind: "note",
					noteId: filePath,
					title: preview.title,
					content: preview.content,
				},
			]);
		},
		[activeViewDoc, addBatchToCanvas],
	);

	// ---------------------------------------------------------------------------
	// Menu listeners
	// ---------------------------------------------------------------------------
	useMenuListeners({ onOpenVault, onCreateVault, closeVault });

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
				id: "open-vault",
				label: "Open vault",
				shortcut: { meta: true, key: "o" },
				action: onOpenVault,
			},
			{
				id: "toggle-ai",
				label: "Toggle AI",
				shortcut: { meta: true, shift: true, key: "a" },
				enabled: Boolean(vaultPath),
				action: () => setAiPanelOpen((v) => !v),
			},
			{
				id: "new-note",
				label: "New note",
				shortcut: { meta: true, key: "n" },
				enabled: Boolean(vaultPath),
				action: () => void fileTree.onNewFile(),
			},
			{
				id: "new-canvas",
				label: "New canvas",
				shortcut: { meta: true, shift: true, key: "n" },
				enabled: Boolean(vaultPath),
				action: async () => createCanvasAndOpen(),
			},
		],
		[fileTree, createCanvasAndOpen, onOpenVault, setAiPanelOpen, vaultPath],
	);

	useCommandShortcuts({
		commands,
		paletteOpen,
		onOpenPalette: () => {
			setPaletteInitialTab("commands");
			setPaletteOpen(true);
		},
		onOpenPaletteSearch: () => {
			setPaletteInitialTab("search");
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
			className={cn("appShell", sidebarCollapsed && "appShellSidebarCollapsed")}
		>
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div className="sidebarTopToggle">
				<Button
					data-sidebar="trigger"
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					aria-pressed={!sidebarCollapsed}
					data-window-drag-ignore
					onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
					title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{sidebarCollapsed ? (
						<PanelLeftOpen size={14} />
					) : (
						<PanelLeftClose size={14} />
					)}
				</Button>
			</div>

			<Sidebar
				onSelectDir={(p) => void openFolderView(p)}
				onOpenFile={(p) => void fileTree.openFile(p)}
				onNewFileInDir={(p) => void fileTree.onNewFileInDir(p)}
				onNewFolderInDir={(p) => fileTree.onNewFolderInDir(p)}
				onRenameDir={(p, name) => fileTree.onRenameDir(p, name)}
				onToggleDir={fileTree.toggleDir}
				onSelectTag={(t) => void openTagView(t)}
				canvases={canvasLibrary.canvases}
				activeCanvasId={selectedCanvasId}
				onSelectCanvas={(id) => void openCanvas(id)}
				onCreateCanvas={() => void createCanvasAndOpen()}
				onAddNotesToCanvas={addNotesToCanvas}
				onCreateNoteInCanvas={() => void createNewCanvasNote()}
				onRenameCanvas={renameCanvasAndUpdate}
				onOpenCommandPalette={() => {
					setPaletteInitialTab("commands");
					setPaletteOpen(true);
				}}
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

			<MainContent
				canvasCommand={canvasCommand}
				setCanvasCommand={setCanvasCommand}
				loadAndBuildFolderView={openFolderView}
				fileTree={fileTree}
				aiOverlay={
					vaultPath ? (
						<AIFloatingHost
							isOpen={aiPanelOpen}
							onToggle={() => setAiPanelOpen((v) => !v)}
							activeFolderPath={
								activeViewDoc?.kind === "folder"
									? activeViewDoc.selector || ""
									: null
							}
							activeCanvasId={
								activeViewDoc?.kind === "canvas" ? activeViewDoc.selector : null
							}
							onAddAttachmentsToCanvas={addAttachmentsToCanvas}
							onCreateNoteFromLastAssistant={createNoteFromAI}
						/>
					) : undefined
				}
			/>

			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
			<CommandPalette
				open={paletteOpen}
				initialTab={paletteInitialTab}
				commands={commands}
				onClose={() => setPaletteOpen(false)}
				vaultPath={vaultPath}
				onSelectSearchNote={(id) => void fileTree.openMarkdownFileInCanvas(id)}
			/>
		</div>
	);
}
