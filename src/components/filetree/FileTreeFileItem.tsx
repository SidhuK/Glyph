import type { DragEvent, MouseEvent } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
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
	type FileTreeMoveOptions,
	splitEditableFileName,
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
	siblingIndex: number;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		options?: FileTreeMoveOptions,
	) => Promise<string | null>;
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
	siblingIndex,
	onDeletePath,
	onMovePath,
}: FileTreeFileItemProps) {
	const rowStyle = buildRowStyle(depth);
	const { label } = getFileTypeInfo(entry.rel_path, entry.is_markdown);
	const { stem: fileStem, ext: fileExt } = splitEditableFileName(entry.name);
	const isMd = fileExt.toLowerCase() === ".md";
	const displayStem =
		fileStem.trim() ||
		basename(entry.rel_path)
			.replace(/\.[^.]+$/, "")
			.trim() ||
		"Untitled";
	const extBadge = !isMd && fileExt ? fileExt.slice(1) : "";
	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameSubmittedRef = useRef(false);
	const [draftName, setDraftName] = useState(fileStem || entry.name);
	const [dropIndicator, setDropIndicator] = useState<"top" | "bottom" | null>(null);

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

	const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
		event.dataTransfer.effectAllowed = "copyMove";
		event.dataTransfer.setData("text/glyph-filetree-path", entry.rel_path);
		event.dataTransfer.setData("text/glyph-filetree-kind", "file");
		event.dataTransfer.setData("text/plain", entry.rel_path);

		// Force the cursor change immediately on Windows
		document.body.classList.add("dragging-in-progress");
	};

	const handleDragEnd = useCallback(() => {
		document.body.classList.remove("dragging-in-progress");
		setDropIndicator(null);
	}, []);

	useEffect(() => {
		window.addEventListener("dragend", handleDragEnd);
		return () => {
			window.removeEventListener("dragend", handleDragEnd);
			handleDragEnd();
		};
	}, [handleDragEnd]);

	const handleDragOver = (e: DragEvent<HTMLLIElement>) => {
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "move";

		const rect = e.currentTarget.getBoundingClientRect();
		const y = e.clientY - rect.top;
		if (y < rect.height / 2) {
			setDropIndicator("top");
		} else {
			setDropIndicator("bottom");
		}
	};

	const handleDragLeave = (e: DragEvent<HTMLLIElement>) => {
		e.stopPropagation();
		setDropIndicator(null);
	};

	const handleDrop = async (e: DragEvent<HTMLLIElement>) => {
		e.preventDefault();
		e.stopPropagation();
		const currentIndicator = dropIndicator;
		setDropIndicator(null);

		const fromPath = e.dataTransfer.getData("text/glyph-filetree-path")?.trim();
		if (!fromPath || fromPath === entry.rel_path) return;

		const index = currentIndicator === "top" ? siblingIndex : siblingIndex + 1;
		await onMovePath(fromPath, parentDirPath, { index });
	};

	let liClassName = isActive ? "fileTreeItem active" : "fileTreeItem";
	if (dropIndicator === "top") liClassName += " drop-indicator-top";
	if (dropIndicator === "bottom") liClassName += " drop-indicator-bottom";

	return (
		<li
			className={liClassName}
			onDragOver={handleDragOver}
			onDragEnter={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={(e) => void handleDrop(e)}
		>
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
							<button
								type="button"
								className={`fileTreeRow${isActive ? " is-active" : ""}`}
								onClick={() => onOpenFile(entry.rel_path)}
								style={rowStyle}
								title={`${entry.rel_path} (${label})`}
								draggable
								onDragStart={handleDragStart}
								onDragEnd={handleDragEnd}
							>
								<span className="fileTreeLeadingSpacer" aria-hidden="true" />
								<span className="fileTreeName">{displayStem}</span>
								{extBadge && (
									<span className="fileTreeExtBadge">{extBadge}</span>
								)}
							</button>
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
