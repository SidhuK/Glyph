import { m } from "motion/react";
import type { MouseEvent } from "react";
import { memo, useEffect, useRef, useState } from "react";
import type { FsEntry } from "../../lib/tauri";
import { FolderPlus, Plus, Trash2 } from "../Icons";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";
import {
	buildRowStyle,
	rowVariants,
	splitEditableFileName,
	springTransition,
	truncateMiddle,
} from "./fileTreeItemHelpers";
import { basename, getFileTypeInfo } from "./fileTypeUtils";

interface FileTreeFileItemProps {
	entry: FsEntry;
	depth: number;
	isActive: boolean;
	isRenaming: boolean;
	onOpenFile: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => unknown;
	onNewDatabaseInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
	onStartRename: () => void;
	onCommitRename: (path: string, nextName: string) => Promise<void> | void;
	onCancelRename: () => void;
	parentDirPath: string;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
}

export const FileTreeFileItem = memo(function FileTreeFileItem({
	entry,
	depth,
	isActive,
	isRenaming,
	onOpenFile,
	onNewFileInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onStartRename,
	onCommitRename,
	onCancelRename,
	parentDirPath,
	onDeletePath,
}: FileTreeFileItemProps) {
	const rowStyle = buildRowStyle(depth);
	const { label } = getFileTypeInfo(entry.rel_path, entry.is_markdown);
	const { stem: fileStem, ext: fileExt } = splitEditableFileName(entry.name);
	const isMd = fileExt.toLowerCase() === ".md";
	const displayStem = truncateMiddle(
		fileStem.trim() ||
			basename(entry.rel_path)
				.replace(/\.[^.]+$/, "")
				.trim() ||
			"Untitled",
		18,
	);
	const extBadge = !isMd && fileExt ? fileExt.slice(1) : "";
	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameSubmittedRef = useRef(false);
	const [draftName, setDraftName] = useState(fileStem || entry.name);

	useEffect(() => {
		if (!isRenaming) return;
		setDraftName(fileStem || entry.name.trim() || "Untitled");
		renameSubmittedRef.current = false;
		window.requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	}, [entry.name, fileStem, isRenaming]);

	const stopInputEvent = (event: MouseEvent<HTMLElement>) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const commitRename = async () => {
		if (renameSubmittedRef.current) return;
		renameSubmittedRef.current = true;
		const nextStem = draftName.trim() || fileStem || entry.name.trim();
		const nextName = `${nextStem}${fileExt}`;
		await onCommitRename(entry.rel_path, nextName);
	};

	return (
		<li className={isActive ? "fileTreeItem active" : "fileTreeItem"}>
			<div className="fileTreeRowShell">
				{isRenaming ? (
					<div className="fileTreeRow fileTreeRowEditing" style={rowStyle}>
						<span className="fileTreeLeadingSpacer" aria-hidden="true" />
						<input
							ref={inputRef}
							className="fileTreeRenameInput"
							value={draftName}
							placeholder="Untitled"
							onChange={(event) => setDraftName(event.target.value)}
							onMouseDown={stopInputEvent}
							onClick={stopInputEvent}
							onBlur={() => void commitRename()}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void commitRename();
									return;
								}
								if (event.key === "Escape") {
									event.preventDefault();
									renameSubmittedRef.current = true;
									onCancelRename();
								}
							}}
						/>
					</div>
				) : (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<m.button
								type="button"
								className="fileTreeRow"
								onClick={() => onOpenFile(entry.rel_path)}
								style={rowStyle}
								title={`${entry.rel_path} (${label})`}
								variants={rowVariants}
								whileHover="hover"
								whileTap="tap"
								animate={isActive ? "active" : "idle"}
								transition={springTransition}
							>
								<span className="fileTreeLeadingSpacer" aria-hidden="true" />
								<span className="fileTreeName">{displayStem}</span>
								{extBadge && (
									<span className="fileTreeExtBadge">{extBadge}</span>
								)}
							</m.button>
						</ContextMenuTrigger>
						<ContextMenuContent className="fileTreeCreateMenu">
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onOpenFile(entry.rel_path)}
							>
								Open
							</ContextMenuItem>
							<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={onStartRename}
							>
								Rename
							</ContextMenuItem>
							<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFileInDir(parentDirPath)}
							>
								<Plus size={14} />
								Add file
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewDatabaseInDir(parentDirPath)}
							>
								<Plus size={14} />
								Add database
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFolderInDir(parentDirPath)}
							>
								<FolderPlus size={14} />
								Add folder
							</ContextMenuItem>
							<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => onDeletePath(entry.rel_path, "file")}
							>
								<Trash2 size={14} />
								Delete file
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				)}
			</div>
		</li>
	);
});
