import {
	type CSSProperties,
	type ReactNode,
	memo,
	useMemo,
	useState,
} from "react";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { FolioNotesListPane } from "./FolioNotesListPane";

interface FolioWorkspaceProps {
	children: ReactNode;
	activeTabPath: string | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onDeleteFile: (relPath: string) => Promise<boolean>;
}

export const FolioWorkspace = memo(function FolioWorkspace({
	children,
	activeTabPath,
	onOpenFile,
	onOpenFileInNewTab,
	onDeleteFile,
}: FolioWorkspaceProps) {
	const [notesWidth, setNotesWidth] = useState(320);
	const resize = useResizablePanel({
		min: 260,
		max: 420,
		direction: "right",
		currentWidth: notesWidth,
		onResize: setNotesWidth,
	});
	const style = useMemo(
		() =>
			({
				"--folio-notes-width": `${notesWidth}px`,
			}) as CSSProperties,
		[notesWidth],
	);

	return (
		<div className="folioWorkspace" style={style}>
			<FolioNotesListPane
				activeTabPath={activeTabPath}
				onOpenFile={onOpenFile}
				onOpenFileInNewTab={onOpenFileInNewTab}
				onDeleteFile={onDeleteFile}
			/>
			<div
				ref={resize.resizeRef}
				className="folioNotesResizeHandle"
				onPointerDown={resize.handlePointerDown}
				onPointerMove={resize.handlePointerMove}
				onPointerUp={resize.handlePointerUp}
				data-window-drag-ignore
			/>
			<div className="folioEditorHost">{children}</div>
		</div>
	);
});
