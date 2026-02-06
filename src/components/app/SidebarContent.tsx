import { AnimatePresence, motion } from "motion/react";
import type {
	DirChildSummary,
	FsEntry,
	SearchResult,
	TagCount,
} from "../../lib/tauri";
import { openSettingsWindow } from "../../lib/windows";
import { FileTreePane } from "../FileTreePane";
import { Files, Settings, Tags } from "../Icons";
import { SearchPane } from "../SearchPane";
import { TagsPane } from "../TagsPane";

interface SidebarContentProps {
	vaultPath: string | null;
	vaultSchemaVersion: number | null;
	isIndexing: boolean;
	showSearch: boolean;
	sidebarViewMode: "files" | "tags";
	setSidebarViewMode: (mode: "files" | "tags") => void;
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
	onNewFolderInDir: (dirPath: string) => void;
	tags: TagCount[];
	tagsError: string;
	onSelectTag: (tag: string) => void;
	onRefreshTags: () => void;
}

export function SidebarContent({
	vaultPath,
	vaultSchemaVersion,
	isIndexing,
	showSearch,
	sidebarViewMode,
	setSidebarViewMode,
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
	tags,
	tagsError,
	onSelectTag,
	onRefreshTags,
}: SidebarContentProps) {
	if (!vaultPath) {
		return (
			<>
				<div className="sidebarSection sidebarEmpty">
					<div className="sidebarEmptyTitle">No vault open</div>
					<div className="sidebarEmptyHint">
						Open or create a vault to get started.
					</div>
				</div>
				<SidebarFooter />
			</>
		);
	}

	return (
		<>
			{showSearch && (
				<div className="sidebarSection">
					<SearchPane
						query={searchQuery}
						results={searchResults}
						isSearching={isSearching}
						error={searchError}
						onChangeQuery={onChangeSearchQuery}
						onOpenAsCanvas={onOpenSearchAsCanvas}
						onSelectNote={onSelectSearchNote}
					/>
				</div>
			)}

			<div className="sidebarSection vaultInfo">
				<div className="vaultPath mono">{vaultPath.split("/").pop()}</div>
				<div className="vaultMeta">
					{vaultSchemaVersion ? `v${vaultSchemaVersion}` : ""}
					{isIndexing ? " • indexing" : ""}
				</div>
			</div>

			<div className="sidebarSection sidebarSectionGrow">
				<div className="sidebarSectionHeader">
					<div className="sidebarSectionToggle">
						<button
							type="button"
							className={
								sidebarViewMode === "files" ? "segBtn active" : "segBtn"
							}
							onClick={() => setSidebarViewMode("files")}
							title="Files"
						>
							<Files size={14} />
						</button>
						<button
							type="button"
							className={
								sidebarViewMode === "tags" ? "segBtn active" : "segBtn"
							}
							onClick={() => setSidebarViewMode("tags")}
							title="Tags"
						>
							<Tags size={14} />
						</button>
					</div>
				</div>

				<AnimatePresence mode="wait">
					{sidebarViewMode === "files" ? (
						<motion.div
							key="files"
							initial={{ x: -20 }}
							animate={{ x: 0 }}
							exit={{ x: -20 }}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
						>
							<FileTreePane
								rootEntries={rootEntries}
								childrenByDir={childrenByDir}
								expandedDirs={expandedDirs}
								activeFilePath={activeFilePath}
								onToggleDir={onToggleDir}
								onSelectDir={onSelectDir}
								onOpenFile={onOpenFile}
								onNewFile={onNewFile}
								onNewFileInDir={onNewFileInDir}
								onNewFolderInDir={onNewFolderInDir}
								summariesByParentDir={summariesByParentDir}
							/>
						</motion.div>
					) : (
						<motion.div
							key="tags"
							initial={{ x: 20 }}
							animate={{ x: 0 }}
							exit={{ x: 20 }}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
						>
							{tagsError ? (
								<div className="searchError">{tagsError}</div>
							) : null}
							<TagsPane
								tags={tags}
								onSelectTag={onSelectTag}
								onRefresh={onRefreshTags}
							/>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<SidebarFooter />
		</>
	);
}

function SidebarFooter() {
	return (
		<div className="sidebarFooter">
			<button
				type="button"
				className="sidebarFooterBtn"
				onClick={() => void openSettingsWindow("general")}
			>
				<Settings size={16} />
				<span>Settings</span>
			</button>
		</div>
	);
}
