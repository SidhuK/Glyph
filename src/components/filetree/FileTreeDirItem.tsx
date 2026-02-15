import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent, ReactNode } from "react";
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
	springTransition,
	truncateTreeLabel,
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
	onNewFolderInDir: (dirPath: string) => unknown;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
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
	onNewFolderInDir,
	onDeletePath,
}: FileTreeDirItemProps) {
	const rowStyle = buildRowStyle(depth);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameSubmittedRef = useRef(false);
	const [draftName, setDraftName] = useState(entry.name);
	const displayDirName = truncateTreeLabel(entry.name, false);

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

	return (
		<li className="fileTreeItem">
			<div className="fileTreeRowShell">
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
							<motion.button
								type="button"
								className="fileTreeRow"
								onClick={() => {
									onSelectDir(entry.rel_path);
									onToggleDir(entry.rel_path);
								}}
								style={rowStyle}
								variants={rowVariants}
								whileHover="hover"
								whileTap="tap"
								animate={isActive ? "active" : "idle"}
								transition={springTransition}
								title={entry.rel_path || entry.name || "Folder"}
							>
								<HugeiconsIcon
									icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
									size={12}
									className="fileTreeChevron"
								/>
								<span className="fileTreeName">{displayDirName}</span>
							</motion.button>
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
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={springTransition}
						style={{ overflow: "hidden" }}
					>
						{children}
					</motion.div>
				) : null}
			</AnimatePresence>
		</li>
	);
});
