import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAISidebar } from "../../hooks/useAISidebar";
import { useCommandShortcuts } from "../../hooks/useCommandShortcuts";
import { useFileTree } from "../../hooks/useFileTree";
import { useFolderShelf } from "../../hooks/useFolderShelf";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { useSearch } from "../../hooks/useSearch";
import { useViewLoader } from "../../hooks/useViewLoader";
import type { Shortcut } from "../../lib/shortcuts";
import type { FsEntry } from "../../lib/tauri";
import { onWindowDragMouseDown } from "../../utils/window";
import type { CanvasExternalCommand } from "../CanvasPane";
import { PanelLeftClose, PanelLeftOpen } from "../Icons";
import { MotionIconButton } from "../MotionUI";
import { AISidebar } from "../ai/AISidebar";
import { type Command, CommandPalette } from "./CommandPalette";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
	vaultPath: string | null;
	lastVaultPath: string | null;
	vaultSchemaVersion: number | null;
	recentVaults: string[];
	isIndexing: boolean;
	appName: string | null;
	error: string;
	setError: (error: string) => void;
	rootEntries: FsEntry[];
	setRootEntries: React.Dispatch<React.SetStateAction<FsEntry[]>>;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	setChildrenByDir: React.Dispatch<
		React.SetStateAction<Record<string, FsEntry[] | undefined>>
	>;
	dirSummariesByParent: Record<
		string,
		import("../../lib/tauri").DirChildSummary[] | undefined
	>;
	setDirSummariesByParent: React.Dispatch<
		React.SetStateAction<
			Record<string, import("../../lib/tauri").DirChildSummary[] | undefined>
		>
	>;
	expandedDirs: Set<string>;
	setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
	activeFilePath: string | null;
	setActiveFilePath: (path: string | null) => void;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	onOpenVault: () => void;
	onOpenVaultAtPath: (path: string) => Promise<void>;
	onContinueLastVault: () => Promise<void>;
	onCreateVault: () => void;
	closeVault: () => Promise<void>;
	startIndexRebuild: () => Promise<void>;
	tags: import("../../lib/tauri").TagCount[];
	tagsError: string;
	refreshTags: () => Promise<void>;
}

export function AppShell({
	vaultPath,
	lastVaultPath,
	vaultSchemaVersion,
	recentVaults,
	isIndexing,
	appName,
	error,
	setError,
	rootEntries,
	setRootEntries,
	childrenByDir,
	setChildrenByDir,
	dirSummariesByParent,
	setDirSummariesByParent,
	expandedDirs,
	setExpandedDirs,
	activeFilePath,
	setActiveFilePath,
	activeNoteId,
	activeNoteTitle,
	onOpenVault,
	onOpenVaultAtPath,
	onContinueLastVault,
	onCreateVault,
	closeVault,
	startIndexRebuild,
	tags,
	tagsError,
	refreshTags,
}: AppShellProps) {
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);
	const initialViewLoadVaultRef = useRef<string | null>(null);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);
	const [paletteOpen, setPaletteOpen] = useState(false);

	const {
		aiSidebarOpen,
		setAiSidebarOpen,
		aiSidebarWidth,
		isResizing: aiSidebarResizing,
		handleResizeMouseDown,
	} = useAISidebar();

	const {
		searchQuery,
		setSearchQuery,
		searchResults,
		isSearching,
		searchError,
		showSearch,
		setShowSearch,
	} = useSearch(vaultPath);

	const {
		activeViewDoc,
		canvasLoadingMessage,
		activeViewDocRef,
		activeViewPathRef,
		setActiveViewDoc,
		loadAndBuildFolderView,
		loadAndBuildSearchView,
		loadAndBuildTagView,
	} = useViewLoader({ setError, startIndexRebuild });

	useEffect(() => {
		if (!vaultPath) {
			initialViewLoadVaultRef.current = null;
			return;
		}
		if (activeViewDoc) return;
		if (initialViewLoadVaultRef.current === vaultPath) return;
		initialViewLoadVaultRef.current = vaultPath;
		void loadAndBuildFolderView("").finally(() => {
			if (initialViewLoadVaultRef.current === vaultPath) {
				initialViewLoadVaultRef.current = null;
			}
		});
	}, [vaultPath, activeViewDoc, loadAndBuildFolderView]);

	const { folderShelfSubfolders, folderShelfRecents } = useFolderShelf(
		vaultPath,
		activeViewDoc,
	);

	const setCanvasCommandTyped = useCallback(
		(
			cmd: { id: string; kind: string; noteId?: string; title?: string } | null,
		) => {
			setCanvasCommand(cmd as CanvasExternalCommand | null);
		},
		[],
	);

	const getActiveFolderDir = useCallback(() => {
		const current = activeViewDocRef.current;
		if (!current || current.kind !== "folder") return null;
		return current.selector || "";
	}, [activeViewDocRef]);

	const fileTree = useFileTree({
		vaultPath,
		setChildrenByDir,
		setDirSummariesByParent,
		setExpandedDirs,
		setRootEntries,
		setActiveFilePath,
		setCanvasCommand: setCanvasCommandTyped,
		setError,
		loadAndBuildFolderView,
		getActiveFolderDir,
	});

	useMenuListeners({ onOpenVault, onCreateVault, closeVault });

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
				action: () => setAiSidebarOpen(!aiSidebarOpen),
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
					await loadAndBuildFolderView("");
					setCanvasCommand({
						id: crypto.randomUUID(),
						kind: "add_text_node",
						text: "",
					});
				},
			},
		],
		[
			aiSidebarOpen,
			fileTree,
			loadAndBuildFolderView,
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
				vaultPath={vaultPath}
				vaultSchemaVersion={vaultSchemaVersion}
				isIndexing={isIndexing}
				sidebarCollapsed={sidebarCollapsed}
				sidebarViewMode={sidebarViewMode}
				setSidebarViewMode={setSidebarViewMode}
				showSearch={showSearch}
				setShowSearch={setShowSearch}
				searchQuery={searchQuery}
				searchResults={searchResults}
				isSearching={isSearching}
				searchError={searchError}
				onChangeSearchQuery={setSearchQuery}
				onOpenSearchAsCanvas={(q) => void loadAndBuildSearchView(q)}
				onSelectSearchNote={(id) => void fileTree.openMarkdownFileInCanvas(id)}
				rootEntries={rootEntries}
				childrenByDir={childrenByDir}
				expandedDirs={expandedDirs}
				activeFilePath={activeFilePath}
				summariesByParentDir={dirSummariesByParent}
				onToggleDir={fileTree.toggleDir}
				onSelectDir={(p) => void loadAndBuildFolderView(p)}
				onOpenFile={(p) => void fileTree.openFile(p)}
				onNewFile={fileTree.onNewFile}
				onNewFileInDir={(p) => void fileTree.onNewFileInDir(p)}
				onNewFolderInDir={(p) => fileTree.onNewFolderInDir(p)}
				onRenameDir={(p, name) => fileTree.onRenameDir(p, name)}
				tags={tags}
				tagsError={tagsError}
				onSelectTag={(t) => void loadAndBuildTagView(t)}
				onRefreshTags={() => void refreshTags()}
				onOpenVault={onOpenVault}
				onCreateVault={onCreateVault}
				onOpenCommandPalette={() => setPaletteOpen(true)}
			/>

			<MainContent
				vaultPath={vaultPath}
				appName={appName}
				lastVaultPath={lastVaultPath}
				recentVaults={recentVaults}
				activeViewDoc={activeViewDoc}
				activeViewDocRef={activeViewDocRef}
				activeViewPathRef={activeViewPathRef}
				canvasLoadingMessage={canvasLoadingMessage}
				aiSidebarOpen={aiSidebarOpen}
				setAiSidebarOpen={setAiSidebarOpen}
				activeNoteId={activeNoteId}
				activeNoteTitle={activeNoteTitle}
				canvasCommand={canvasCommand}
				setCanvasCommand={setCanvasCommand}
				folderShelfSubfolders={folderShelfSubfolders}
				folderShelfRecents={folderShelfRecents}
				setActiveFilePath={setActiveFilePath}
				setActiveViewDoc={setActiveViewDoc}
				loadAndBuildFolderView={loadAndBuildFolderView}
				fileTree={fileTree}
				onOpenVault={onOpenVault}
				onOpenVaultAtPath={onOpenVaultAtPath}
				onContinueLastVault={onContinueLastVault}
				onCreateVault={onCreateVault}
			/>

			{vaultPath && (
				<>
					<div
						className="rightSidebarResizer"
						aria-hidden={!aiSidebarOpen}
						data-window-drag-ignore
						onMouseDown={handleResizeMouseDown}
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
