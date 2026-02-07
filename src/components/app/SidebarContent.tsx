import { AnimatePresence, motion } from "motion/react";
import { useFileTreeContext, useUIContext, useVault } from "../../contexts";
import { openSettingsWindow } from "../../lib/windows";
import { cn } from "../../utils/cn";
import { FileTreePane } from "../FileTreePane";
import { Files, Settings, Tags } from "../Icons";
import { SearchPane } from "../SearchPane";
import { TagsPane } from "../TagsPane";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFile: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onOpenSearchAsCanvas: (query: string) => void;
	onSelectSearchNote: (id: string) => void;
	onSelectTag: (tag: string) => void;
}

export function SidebarContent({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	onOpenSearchAsCanvas,
	onSelectSearchNote,
	onSelectTag,
}: SidebarContentProps) {
	// Contexts
	const { vaultPath, vaultSchemaVersion, isIndexing } = useVault();
	const {
		rootEntries,
		childrenByDir,
		expandedDirs,
		activeFilePath,
		dirSummariesByParent,
		tags,
		tagsError,
		refreshTags,
	} = useFileTreeContext();
	const {
		showSearch,
		searchQuery,
		searchResults,
		isSearching,
		searchError,
		setSearchQuery,
		setSearchInputElement,
		sidebarViewMode,
		setSidebarViewMode,
	} = useUIContext();

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
						onChangeQuery={setSearchQuery}
						onSearchInputRef={setSearchInputElement}
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
							className={cn("segBtn", sidebarViewMode === "files" && "active")}
							onClick={() => setSidebarViewMode("files")}
							title="Files"
						>
							<Files size={14} />
						</button>
						<button
							type="button"
							className={cn("segBtn", sidebarViewMode === "tags" && "active")}
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
								onRenameDir={onRenameDir}
								summariesByParentDir={dirSummariesByParent}
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
								onRefresh={() => void refreshTags()}
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
