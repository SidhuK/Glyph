import { FileTreePane } from "@/components/filetree";
import { useFileTreeContext, useUILayoutContext } from "@/contexts";
import { Activity, type MouseEvent, type PointerEvent, useRef } from "react";
import type { SidebarView, SidebarViewKind } from "./SidebarViewStrip";
import type { SidebarContentProps } from "./sidebarContentProps";
import { useFileTreeRename } from "./useFileTreeRename";
import { useFolioTree } from "./useFolioTree";

export type SidebarFileTreeProps = Pick<
	SidebarContentProps,
	| "spacePath"
	| "onToggleDir"
	| "onLoadDir"
	| "onSelectDir"
	| "onOpenFile"
	| "onPrefetchFile"
	| "onNewFileInDir"
	| "onCreateFromTemplateInDir"
	| "onImportFilesInDir"
	| "onImportFolderInDir"
	| "onImportPathsInDir"
	| "onRequestCreateFolder"
	| "onDuplicateFile"
	| "onRenameDir"
	| "onDeletePath"
	| "onMovePath"
>;

interface SidebarFilesPanelProps extends SidebarFileTreeProps {
	view: SidebarView;
	onSelectFolioFolder: (dirPath: string) => void;
	onSelectView: (view: SidebarViewKind) => void;
	onToggleSidebarFolderTab: (folderPath: string) => Promise<void>;
	/** Runs after a click (or Enter) opens a file row; the rail flyout closes on it. Arrow-key
	 * navigation also opens files but keeps the flyout open. */
	onFileRowClick: () => void;
}

/** Pointer travel beyond which a release is the end of a drag, not a click. */
const CLICK_SLOP_PX = 4;

/** Reports clicks that open a file row. Releasing a dragged row also clicks it (the tree
 * swallows that click), so pointer travel past the slop doesn't count; keyboard clicks
 * (Enter) always do. */
function useFileRowClick(onFileRowClick: () => void) {
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	return {
		onPointerDown: (event: PointerEvent<HTMLElement>) => {
			pointerDownRef.current = { x: event.clientX, y: event.clientY };
		},
		onClick: (event: MouseEvent<HTMLElement>) => {
			if (!(event.target instanceof Element)) return;
			if (!event.target.closest('[data-file-tree-file="true"]')) return;
			const start = pointerDownRef.current;
			const dragged =
				event.detail > 0 &&
				start !== null &&
				Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX;
			if (!dragged) onFileRowClick();
		},
	};
}

/** The file tree panel, shared by the Files view and quick-folder views. */
export function SidebarFilesPanel({
	view,
	onSelectFolioFolder,
	onSelectView,
	onToggleSidebarFolderTab,
	onFileRowClick,
	spacePath,
	onLoadDir,
	onSelectDir,
	onOpenFile,
	onRenameDir,
	...treeProps
}: SidebarFilesPanelProps) {
	const {
		expandedDirs,
		activeDirPath,
		activeFilePath,
		pinnedFiles,
		togglePinnedFile,
		sidebarFolderTabs,
	} = useFileTreeContext();
	const { folioMode } = useUILayoutContext();
	const { rootEntries, childrenByDir } = useFolioTree(spacePath, onLoadDir);
	const rename = useFileTreeRename(onRenameDir, onOpenFile);
	const folderPath = view.kind === "folder" ? view.path : null;
	const fileRowClick = useFileRowClick(onFileRowClick);

	return (
		<Activity mode={view.kind === "files" || folderPath !== null ? "visible" : "hidden"}>
			<section
				className="sidebarStackItem sidebarStackItemGrow sidebarViewPanel"
				data-section="files"
				id="sidebar-files-panel"
				role="tabpanel"
				aria-labelledby={
					folderPath !== null
						? `sidebar-folder-tab-${sidebarFolderTabs.indexOf(folderPath) + 1}`
						: "sidebar-files-tab"
				}
				{...fileRowClick}
			>
				<FileTreePane
					key={folderPath !== null ? `folder:${folderPath}` : "files"}
					{...treeProps}
					rootEntries={rootEntries}
					childrenByDir={childrenByDir}
					expandedDirs={expandedDirs}
					activeFilePath={folioMode ? null : activeFilePath}
					activeDirPath={activeDirPath}
					onLoadDir={onLoadDir}
					onSelectDir={folioMode ? onSelectFolioFolder : onSelectDir}
					onOpenFile={onOpenFile}
					renamingPath={rename.renamingPath}
					onStartRename={rename.handleStartRename}
					onCancelRename={rename.handleCancelRename}
					onCommitFileRename={rename.handleCommitFileRename}
					onCommitDirRename={rename.handleCommitDirRename}
					initialFocusedDirPath={folderPath}
					onExitFocusedDir={folderPath !== null ? () => onSelectView("files") : undefined}
					sidebarFolderTabs={sidebarFolderTabs}
					onToggleSidebarFolderTab={onToggleSidebarFolderTab}
					pinnedFiles={folioMode ? [] : pinnedFiles}
					onTogglePinnedFile={togglePinnedFile}
				/>
			</section>
		</Activity>
	);
}
