import { AnimatePresence, motion } from "motion/react";
import type {
	DirChildSummary,
	FsEntry,
	SearchResult,
	TagCount,
} from "../../lib/tauri";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";

interface SidebarProps {
	vaultPath: string | null;
	vaultSchemaVersion: number | null;
	isIndexing: boolean;
	sidebarCollapsed: boolean;
	sidebarViewMode: "files" | "tags";
	setSidebarViewMode: (mode: "files" | "tags") => void;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
	searchQuery: string;
	searchResults: SearchResult[];
	isSearching: boolean;
	searchError: string;
	onChangeSearchQuery: (query: string) => void;
	onOpenSearchAsCanvas: (query: string) => void;
	onSelectSearchNote: (id: string) => void;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	summariesByParentDir: Record<string, DirChildSummary[] | undefined>;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFile: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	tags: TagCount[];
	tagsError: string;
	onSelectTag: (tag: string) => void;
	onRefreshTags: () => void;
	onOpenVault: () => void;
	onCreateVault: () => void;
	onOpenCommandPalette: () => void;
}

export function Sidebar({
	vaultPath,
	vaultSchemaVersion,
	isIndexing,
	sidebarCollapsed,
	sidebarViewMode,
	setSidebarViewMode,
	showSearch,
	setShowSearch,
	searchQuery,
	searchResults,
	isSearching,
	searchError,
	onChangeSearchQuery,
	onOpenSearchAsCanvas,
	onSelectSearchNote,
	rootEntries,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	summariesByParentDir,
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	tags,
	tagsError,
	onSelectTag,
	onRefreshTags,
	onOpenVault,
	onCreateVault,
	onOpenCommandPalette,
}: SidebarProps) {
	return (
		<motion.aside
			className={`sidebar ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}
			layout
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
		>
			<AnimatePresence>
				{!sidebarCollapsed && (
					<motion.div
						key="sidebar-content"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
					>
						<SidebarHeader
							vaultPath={vaultPath}
							showSearch={showSearch}
							setShowSearch={setShowSearch}
							onOpenVault={onOpenVault}
							onCreateVault={onCreateVault}
							onOpenCommandPalette={onOpenCommandPalette}
						/>
						<SidebarContent
							vaultPath={vaultPath}
							vaultSchemaVersion={vaultSchemaVersion}
							isIndexing={isIndexing}
							showSearch={showSearch}
							sidebarViewMode={sidebarViewMode}
							setSidebarViewMode={setSidebarViewMode}
							searchQuery={searchQuery}
							searchResults={searchResults}
							isSearching={isSearching}
							searchError={searchError}
							onChangeSearchQuery={onChangeSearchQuery}
							onOpenSearchAsCanvas={onOpenSearchAsCanvas}
							onSelectSearchNote={onSelectSearchNote}
							rootEntries={rootEntries}
							childrenByDir={childrenByDir}
							expandedDirs={expandedDirs}
							activeFilePath={activeFilePath}
							summariesByParentDir={summariesByParentDir}
							onToggleDir={onToggleDir}
							onSelectDir={onSelectDir}
							onOpenFile={onOpenFile}
							onNewFile={onNewFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={onNewFolderInDir}
							onRenameDir={onRenameDir}
							tags={tags}
							tagsError={tagsError}
							onSelectTag={onSelectTag}
							onRefreshTags={onRefreshTags}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.aside>
	);
}
