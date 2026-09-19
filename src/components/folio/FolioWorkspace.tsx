import { type CSSProperties, type ReactNode, memo, useMemo } from "react";
import { useUILayoutContext } from "../../contexts";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { MAX_FOLIO_NOTES_WIDTH, MIN_FOLIO_NOTES_WIDTH } from "../../lib/settings/definitions";
import { FolioNotesListPane } from "./FolioNotesListPane";

interface FolioWorkspaceProps {
	children: ReactNode;
	activeTabPath: string | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onNavigateBreadcrumbPath: (dirPath: string) => void;
	onRenameFile: (relPath: string, nextName: string) => Promise<string | null>;
	onDeleteFile: (relPath: string) => Promise<boolean>;
	onNewFileInDir: (dirPath: string) => Promise<string | null>;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onRequestCreateFolder: (dirPath: string) => void;
	onDuplicateFile: (path: string) => Promise<string | null>;
}

export const FolioWorkspace = memo(function FolioWorkspace({
	children,
	activeTabPath,
	onOpenFile,
	onOpenFileInNewTab,
	onNavigateBreadcrumbPath,
	onRenameFile,
	onDeleteFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onRequestCreateFolder,
	onDuplicateFile,
}: FolioWorkspaceProps) {
	const { folioNotesWidth, setFolioNotesWidth, commitFolioNotesWidth } = useUILayoutContext();
	const resize = useResizablePanel({
		min: MIN_FOLIO_NOTES_WIDTH,
		max: MAX_FOLIO_NOTES_WIDTH,
		direction: "right",
		currentWidth: folioNotesWidth,
		onResize: setFolioNotesWidth,
		onResizeEnd: commitFolioNotesWidth,
	});
	const style = useMemo(
		() =>
			({
				"--folio-notes-width": `${folioNotesWidth}px`,
			}) as CSSProperties,
		[folioNotesWidth],
	);

	return (
		<div className="folioWorkspace" style={style}>
			<FolioNotesListPane
				activeTabPath={activeTabPath}
				onOpenFile={onOpenFile}
				onOpenFileInNewTab={onOpenFileInNewTab}
				onNavigateBreadcrumbPath={onNavigateBreadcrumbPath}
				onRenameFile={onRenameFile}
				onDeleteFile={onDeleteFile}
				onNewFileInDir={onNewFileInDir}
				onCreateFromTemplateInDir={onCreateFromTemplateInDir}
				onRequestCreateFolder={onRequestCreateFolder}
				onDuplicateFile={onDuplicateFile}
			/>
			<div
				ref={resize.resizeRef}
				className="folioNotesResizeHandle"
				onPointerDown={resize.handlePointerDown}
				onPointerMove={resize.handlePointerMove}
				onPointerUp={resize.handlePointerUp}
				onPointerCancel={resize.handlePointerUp}
				data-window-drag-ignore
			/>
			<div className="folioEditorHost">{children}</div>
		</div>
	);
});
