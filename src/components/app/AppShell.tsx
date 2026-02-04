import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { useAISidebar } from "../../hooks/useAISidebar";
import { useFileTree } from "../../hooks/useFileTree";
import { useFolderShelf } from "../../hooks/useFolderShelf";
import { useMenuListeners } from "../../hooks/useMenuListeners";
import { useSearch } from "../../hooks/useSearch";
import { useViewLoader } from "../../hooks/useViewLoader";
import type { FsEntry } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { onWindowDragMouseDown } from "../../utils/window";
import type { CanvasExternalCommand } from "../CanvasPane";
import { AISidebar } from "../ai/AISidebar";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
	vaultPath: string | null;
	vaultSchemaVersion: number | null;
	recentVaults: string[];
	isIndexing: boolean;
	appName: string | null;
	error: string;
	setError: (error: string) => void;
	rootEntries: FsEntry[];
	setRootEntries: (entries: FsEntry[]) => void;
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
	onCreateVault: () => void;
	closeVault: () => Promise<void>;
	startIndexRebuild: () => Promise<void>;
	tags: import("../../lib/tauri").TagCount[];
	tagsError: string;
	refreshTags: () => Promise<void>;
	resetVaultUiState: () => void;
}

export function AppShell({
	vaultPath,
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
	onCreateVault,
	closeVault,
	startIndexRebuild,
	tags,
	tagsError,
	refreshTags,
	resetVaultUiState,
}: AppShellProps) {
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);

	const {
		aiSidebarOpen,
		setAiSidebarOpen,
		aiSidebarWidth,
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
	});

	useMenuListeners({ onOpenVault, onCreateVault, closeVault });

	const handleSelectRecentVault = useCallback(
		(path: string) => {
			void (async () => {
				resetVaultUiState();
				try {
					await invoke("vault_open", { path });
					const entries = await invoke("vault_list_dir", {});
					setRootEntries(entries);
					const onlyDir =
						entries.filter((e) => e.kind === "dir").length === 1 &&
						entries.filter((e) => e.kind === "file").length === 0
							? (entries.find((e) => e.kind === "dir")?.rel_path ?? "")
							: "";
					await loadAndBuildFolderView(onlyDir);
					void startIndexRebuild();
					void refreshTags();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			})();
		},
		[
			loadAndBuildFolderView,
			refreshTags,
			resetVaultUiState,
			setError,
			setRootEntries,
			startIndexRebuild,
		],
	);

	return (
		<div className={`appShell ${aiSidebarOpen ? "aiSidebarOpen" : ""}`}>
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>

			<Sidebar
				vaultPath={vaultPath}
				vaultSchemaVersion={vaultSchemaVersion}
				isIndexing={isIndexing}
				sidebarCollapsed={sidebarCollapsed}
				setSidebarCollapsed={setSidebarCollapsed}
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
				tags={tags}
				tagsError={tagsError}
				onSelectTag={(t) => void loadAndBuildTagView(t)}
				onRefreshTags={() => void refreshTags()}
				onOpenVault={onOpenVault}
				onCreateVault={onCreateVault}
			/>

			<MainContent
				vaultPath={vaultPath}
				appName={appName}
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
				onCreateVault={onCreateVault}
				handleSelectRecentVault={handleSelectRecentVault}
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
		</div>
	);
}
