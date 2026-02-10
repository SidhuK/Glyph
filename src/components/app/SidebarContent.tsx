import { AnimatePresence, motion } from "motion/react";
import { useFileTreeContext, useUIContext, useVault } from "../../contexts";
import type { CanvasLibraryMeta } from "../../lib/canvases";
import { CanvasesPane } from "../CanvasesPane";
import { FileTreePane } from "../FileTreePane";
import { Files, Layout, Tags } from "../Icons";
import { TagsPane } from "../TagsPane";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/shadcn/tabs";

interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onSelectTag: (tag: string) => void;
	canvases: CanvasLibraryMeta[];
	activeCanvasId: string | null;
	onSelectCanvas: (id: string) => void;
	onCreateCanvas: () => void;
	onAddNotesToCanvas: (paths: string[]) => Promise<void>;
	onCreateNoteInCanvas: () => void;
	onRenameCanvas: (id: string, title: string) => Promise<void>;
}

export function SidebarContent({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	onSelectTag,
	canvases,
	activeCanvasId,
	onSelectCanvas,
	onCreateCanvas,
	onAddNotesToCanvas,
	onCreateNoteInCanvas,
	onRenameCanvas,
}: SidebarContentProps) {
	// Contexts
	const { vaultPath } = useVault();
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
	const { sidebarViewMode, setSidebarViewMode } = useUIContext();

	if (!vaultPath) {
		return (
			<>
				<div className="sidebarSection sidebarEmpty">
					<div className="sidebarEmptyTitle">No vault open</div>
					<div className="sidebarEmptyHint">
						Open or create a vault to get started.
					</div>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="sidebarSection sidebarSectionGrow">
				<div className="sidebarSectionHeader">
					<Tabs
						value={sidebarViewMode}
						onValueChange={(value) =>
							setSidebarViewMode(value as "files" | "tags" | "canvases")
						}
						className="sidebarSectionToggle"
					>
						<TabsList className="w-full rounded-full bg-transparent">
							<TabsTrigger value="files" title="Files">
								<Files size={14} />
							</TabsTrigger>
							<TabsTrigger value="tags" title="Tags">
								<Tags size={14} />
							</TabsTrigger>
							<TabsTrigger value="canvases" title="Canvases">
								<Layout size={14} />
							</TabsTrigger>
						</TabsList>
					</Tabs>
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
								vaultName={vaultPath.split("/").pop()}
								rootEntries={rootEntries}
								childrenByDir={childrenByDir}
								expandedDirs={expandedDirs}
								activeFilePath={activeFilePath}
								onToggleDir={onToggleDir}
								onSelectDir={onSelectDir}
								onOpenFile={onOpenFile}
								onNewFileInDir={onNewFileInDir}
								onNewFolderInDir={onNewFolderInDir}
								onRenameDir={onRenameDir}
								summariesByParentDir={dirSummariesByParent}
							/>
						</motion.div>
					) : sidebarViewMode === "tags" ? (
						<motion.div
							key="tags"
							initial={{ x: 20 }}
							animate={{ x: 0 }}
							exit={{ x: 20 }}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
						>
							<ScrollArea className="h-full">
								{tagsError ? (
									<div className="searchError">{tagsError}</div>
								) : null}
								<TagsPane
									tags={tags}
									onSelectTag={onSelectTag}
									onRefresh={() => void refreshTags()}
								/>
							</ScrollArea>
						</motion.div>
					) : (
						<motion.div
							key="canvases"
							initial={{ x: 20 }}
							animate={{ x: 0 }}
							exit={{ x: 20 }}
							transition={{ duration: 0.2 }}
							className="sidebarSectionContent"
							data-window-drag-ignore
						>
							<ScrollArea className="h-full">
								<CanvasesPane
									canvases={canvases}
									activeCanvasId={activeCanvasId}
									onSelectCanvas={onSelectCanvas}
									onCreateCanvas={onCreateCanvas}
									onAddNotesToCanvas={onAddNotesToCanvas}
									onCreateNoteInCanvas={onCreateNoteInCanvas}
									onRenameCanvas={onRenameCanvas}
								/>
							</ScrollArea>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</>
	);
}
