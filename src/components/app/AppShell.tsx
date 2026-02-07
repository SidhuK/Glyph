import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import {
	useFileTreeContext,
	useUIContext,
	useVault,
	useViewContext,
} from "../../contexts";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useFileTree } from "../../hooks/useFileTree";
import { useFolderShelf } from "../../hooks/useFolderShelf";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import type { Shortcut } from "../../lib/shortcuts";
import { onWindowDragMouseDown } from "../../utils/window";
import type { CanvasExternalCommand } from "../CanvasPane";
import { PanelLeftClose, PanelLeftOpen } from "../Icons";
import { MotionIconButton } from "../MotionUI";
import { AISidebar } from "../ai/AISidebar";
import { type Command, CommandPalette } from "./CommandPalette";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";

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
	} = useViewContext();

	const {
		sidebarCollapsed,
		setSidebarCollapsed,
		paletteOpen,
		setPaletteOpen,
		aiSidebarOpen,
		setAiSidebarOpen,
		aiSidebarWidth,
		aiSidebarResizing,
		handleAiResizePointerDown,
		handleAiResizePointerMove,
		handleAiResizePointerUp,
		handleAiResizePointerCancel,
		setShowSearch,
		setActivePreviewPath,
	} = useUIContext();

	// ---------------------------------------------------------------------------
	// Local state
	// ---------------------------------------------------------------------------
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);

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

	const { folderShelfSubfolders, folderShelfRecents } = useFolderShelf(
		vaultPath,
		activeViewDoc,
	);

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
						const input =
							document.querySelector<HTMLInputElement>(".searchInput");
						input?.focus();
						input?.select();
					});
				},
			},
			{
				id: "toggle-ai",
				label: "Toggle AI",
				shortcut: { meta: true, shift: true, key: "a" },
				enabled: Boolean(vaultPath),
				action: () => setAiSidebarOpen((v) => !v),
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
				action: async () => {
					await openFolderView("");
					setCanvasCommand({
						id: crypto.randomUUID(),
						kind: "add_text_node",
						text: "",
					});
				},
			},
		],
		[
			fileTree,
			openFolderView,
			onOpenVault,
			setAiSidebarOpen,
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
			className={`appShell ${aiSidebarOpen ? "aiSidebarOpen" : ""} ${
				sidebarCollapsed ? "appShellSidebarCollapsed" : ""
			}`}
		>
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div className="sidebarTopToggle">
				<MotionIconButton
					type="button"
					size="sm"
					onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
					title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{sidebarCollapsed ? (
						<PanelLeftOpen size={14} />
					) : (
						<PanelLeftClose size={14} />
					)}
				</MotionIconButton>
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
				onOpenCommandPalette={() => setPaletteOpen(true)}
			/>

			<MainContent
				canvasCommand={canvasCommand}
				setCanvasCommand={setCanvasCommand}
				folderShelfSubfolders={folderShelfSubfolders}
				folderShelfRecents={folderShelfRecents}
				loadAndBuildFolderView={openFolderView}
				fileTree={fileTree}
			/>

			{vaultPath && (
				<>
					<div
						className="rightSidebarResizer"
						aria-hidden={!aiSidebarOpen}
						data-window-drag-ignore
						onPointerDown={handleAiResizePointerDown}
						onPointerMove={handleAiResizePointerMove}
						onPointerUp={handleAiResizePointerUp}
						onPointerCancel={handleAiResizePointerCancel}
					/>

					<AISidebar
						isOpen={aiSidebarOpen}
						width={aiSidebarWidth}
						isResizing={aiSidebarResizing}
						onClose={() => setAiSidebarOpen(false)}
						onOpenSettings={() => {
							setAiSidebarOpen(true);
						}}
						activeFolderPath={
							activeViewDoc?.kind === "folder"
								? activeViewDoc.selector || ""
								: null
						}
					/>
				</>
			)}

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
