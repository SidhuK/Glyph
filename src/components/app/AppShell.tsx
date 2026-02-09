import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { invoke } from "../../lib/tauri";
import { cn } from "../../utils/cn";
import { isMarkdownPath } from "../../utils/path";
import { onWindowDragMouseDown } from "../../utils/window";
import type { CanvasExternalCommand } from "../CanvasPane";
import { PanelLeftClose, PanelLeftOpen } from "../Icons";
import { AIFloatingHost } from "../ai/AIFloatingHost";
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
		loadAndBuildSearchView,
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
		setShowSearch,
		focusSearchInput,
		setActivePreviewPath,
	} = useUIContext();

	// ---------------------------------------------------------------------------
	// Local state
	// ---------------------------------------------------------------------------
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);
	const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);

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

	const canvasLibrary = useCanvasLibrary();

	const openFolderView = useCallback(
		async (dir: string) => {
			setActivePreviewPath(null);
			await loadAndBuildFolderView(dir);
		},
		[loadAndBuildFolderView, setActivePreviewPath],
	);

	const openSearchView = useCallback(
		async (query: string) => {
			setActivePreviewPath(null);
			await loadAndBuildSearchView(query);
		},
		[loadAndBuildSearchView, setActivePreviewPath],
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
		async (source: "manual" | "ai") => {
			if (activeViewDoc?.kind === "canvas") return activeViewDoc.selector;
			if (selectedCanvasId) {
				await openCanvas(selectedCanvasId);
				return selectedCanvasId;
			}
			const created = await canvasLibrary.createCanvas(
				source === "ai" ? "AI Canvas" : "Canvas",
				source,
			);
			setSelectedCanvasId(created.meta.id);
			await openCanvas(created.meta.id);
			return created.meta.id;
		},
		[activeViewDoc, canvasLibrary, openCanvas, selectedCanvasId],
	);

	const addBatchToCanvas = useCallback(
		async (
			source: "manual" | "ai",
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

	const ensureCanvasForAI = useCallback(async () => {
		return ensureCanvasTarget("ai");
	}, [ensureCanvasTarget]);

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
				"ai",
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
			await ensureCanvasForAI();
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
			await addBatchToCanvas("ai", [
				{
					kind: "note",
					noteId: filePath,
					title: preview.title,
					content: preview.content,
				},
			]);
		},
		[activeViewDoc, addBatchToCanvas, ensureCanvasForAI],
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

	const commands = useMemo<Command[]>(
		() => [
			{
				id: "open-vault",
				label: "Open vault",
				shortcut: { meta: true, key: "o" },
				action: onOpenVault,
			},
			{
				id: "search",
				label: "Search",
				shortcut: { meta: true, key: "f" },
				enabled: Boolean(vaultPath),
				action: () => {
					setShowSearch(true);
					window.requestAnimationFrame(() => {
						focusSearchInput();
					});
				},
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
		[
			fileTree,
			createCanvasAndOpen,
			onOpenVault,
			setAiPanelOpen,
			focusSearchInput,
			setShowSearch,
			vaultPath,
		],
	);

	useCommandShortcuts({
		commands,
		paletteOpen,
		onOpenPalette: () => setPaletteOpen(true),
		onClosePalette: () => setPaletteOpen(false),
		openPaletteShortcuts,
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
				onOpenSearchAsCanvas={(q) => void openSearchView(q)}
				onSelectSearchNote={(id) => void fileTree.openMarkdownFileInCanvas(id)}
				onOpenFile={(p) => void fileTree.openFile(p)}
				onNewFile={fileTree.onNewFile}
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
				onOpenCommandPalette={() => setPaletteOpen(true)}
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
							onNewAICanvas={async () => {
								const created = await canvasLibrary.createCanvas(
									"AI Canvas",
									"ai",
								);
								await openCanvas(created.meta.id);
							}}
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
				commands={commands}
				onClose={() => setPaletteOpen(false)}
			/>
		</div>
	);
}
