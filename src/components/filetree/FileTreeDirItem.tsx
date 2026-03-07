import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import type { DragEvent, MouseEvent, ReactNode } from "react";
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
	springTransition,
	type FileTreeMoveOptions,
} from "./fileTreeItemHelpers";

interface FileTreeDirItemProps {
	entry: FsEntry;
	depth: number;
	isExpanded: boolean;
	isActive: boolean;
	isRenaming: boolean;
	children?: ReactNode;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onStartRename: () => void;
	onCommitRename: (dirPath: string, nextName: string) => Promise<void> | void;
	onCancelRename: () => void;
	onNewFileInDir: (dirPath: string) => unknown;
	onNewDatabaseInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		options?: FileTreeMoveOptions,
	) => Promise<string | null>;
	siblingIndex: number;
	childCount: number;
}

export const FileTreeDirItem = memo(function FileTreeDirItem({
	entry,
	depth,
	isExpanded,
	isActive,
	isRenaming,
	children,
	onToggleDir,
	onSelectDir,
	onStartRename,
	onCommitRename,
	onCancelRename,
	onNewFileInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDeletePath,
	onMovePath,
	siblingIndex,
	childCount,
}: FileTreeDirItemProps) {
	const rowStyle = buildRowStyle(depth);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameSubmittedRef = useRef(false);
	const [draftName, setDraftName] = useState(entry.name);
	const [isDropTarget, setIsDropTarget] = useState(false);
	const [dropIndicator, setDropIndicator] = useState<"top" | "bottom" | null>(null);
	const displayDirName = entry.name.trim() || "New Folder";
	const parentDirPath = entry.rel_path.includes("/") ? entry.rel_path.split("/").slice(0, -1).join("/") : "";

	useEffect(() => {
		if (!isRenaming) return;
		setDraftName(entry.name.trim() || "New Folder");
		renameSubmittedRef.current = false;
		window.requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	}, [entry.name, isRenaming]);

	const stopInputEvent = (event: MouseEvent<HTMLElement>) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const commitRename = async () => {
		if (renameSubmittedRef.current) return;
		renameSubmittedRef.current = true;
		await onCommitRename(entry.rel_path, draftName);
	};

	const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();

		const fromPath = event.dataTransfer
			.getData("text/glyph-filetree-path")
			.trim();

		const targetIndicator = dropIndicator;

		setIsDropTarget(false);
		setDropIndicator(null);

		if (!fromPath) return;
		if (fromPath === entry.rel_path) return;

		if (targetIndicator === "top" || targetIndicator === "bottom") {
			if (parentDirPath.startsWith(`${fromPath}/`)) return;
			const index = targetIndicator === "top" ? siblingIndex : siblingIndex + 1;
			await onMovePath(fromPath, parentDirPath, { index });
		} else {
			if (entry.rel_path.startsWith(`${fromPath}/`)) return;
			await onMovePath(fromPath, entry.rel_path, { index: childCount });
		}
	};

	const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "move";

		const rect = event.currentTarget.getBoundingClientRect();
		const y = event.clientY - rect.top;
		const threshold = rect.height * 0.25;

		if (y < threshold) {
			setDropIndicator("top");
			setIsDropTarget(false);
			return;
		}
		if (y > rect.height - threshold) {
			setDropIndicator("bottom");
			setIsDropTarget(false);
			return;
		}

		setDropIndicator(null);
		setIsDropTarget(true);
	};

	const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
		event.stopPropagation();
		setIsDropTarget(false);
		setDropIndicator(null);
	};

	const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
		event.dataTransfer.effectAllowed = "copyMove";
		event.dataTransfer.setData("text/glyph-filetree-path", entry.rel_path);
		event.dataTransfer.setData("text/glyph-filetree-kind", "dir");
		event.dataTransfer.setData("text/plain", entry.rel_path);

		// Force the cursor change immediately on Windows
		document.body.classList.add("dragging-in-progress");
	};

	const handleDragEnd = () => {
		document.body.classList.remove("dragging-in-progress");
		setIsDropTarget(false);
		setDropIndicator(null);
	};

	let liClassName = "fileTreeItem";
	if (isDropTarget) liClassName += " is-drop-target";
	if (dropIndicator === "top") liClassName += " drop-indicator-top";
	if (dropIndicator === "bottom") liClassName += " drop-indicator-bottom";

	return (
		<li
			className={liClassName}
		>
			<div
				className="fileTreeRowShell"
				onDragOver={handleDragOver}
				onDragEnter={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={(event) => void handleDrop(event)}
			>
				{isRenaming ? (
					<div className="fileTreeRow fileTreeRowEditing" style={rowStyle}>
						<input
							ref={inputRef}
							className="fileTreeRenameInput"
							value={draftName}
							placeholder="New Folder"
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
								onClick={() => {
									onSelectDir(entry.rel_path);
									onToggleDir(entry.rel_path);
								}}
								style={rowStyle}
								title={entry.rel_path || entry.name || "Folder"}
								draggable
								onDragStart={handleDragStart}
								onDragEnd={handleDragEnd}
							>
								<HugeiconsIcon
									icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
									size={12}
									className="fileTreeChevron"
								/>
								<span className="fileTreeName">{displayDirName}</span>
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent className="fileTreeCreateMenu">
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFileInDir(entry.rel_path)}
							>
								<Plus size={14} />
								Add file
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewDatabaseInDir(entry.rel_path)}
							>
								<Plus size={14} />
								Add database
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFolderInDir(entry.rel_path)}
							>
								<FolderPlus size={14} />
								Add folder
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
								onSelect={() => onDeletePath(entry.rel_path, "dir")}
							>
								<Trash2 size={14} />
								Delete folder
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				)}
			</div>
			<AnimatePresence>
				{isExpanded && children ? (
					<m.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={springTransition}
						style={{ overflow: "hidden" }}
					>
						{children}
					</m.div>
				) : null}
			</AnimatePresence>
		</li>
	);
});
