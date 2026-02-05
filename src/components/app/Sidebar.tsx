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
	tags,
	tagsError,
	onSelectTag,
	onRefreshTags,
	onOpenVault,
	onCreateVault,
	onOpenCommandPalette,
}: SidebarProps) {
	return (
		<aside className={`sidebar ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
			{!sidebarCollapsed && (
				<SidebarHeader
					vaultPath={vaultPath}
					showSearch={showSearch}
					setShowSearch={setShowSearch}
					onOpenVault={onOpenVault}
					onCreateVault={onCreateVault}
					onOpenCommandPalette={onOpenCommandPalette}
				/>
			)}

			{!sidebarCollapsed && (
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
					tags={tags}
					tagsError={tagsError}
					onSelectTag={onSelectTag}
					onRefreshTags={onRefreshTags}
				/>
			)}
		</aside>
	);
}
