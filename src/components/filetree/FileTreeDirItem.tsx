import { useDraggable, useDroppable } from "@dnd-kit/react";
import {
	DocumentCodeIcon,
	Folder01Icon,
	Folder03Icon,
	PencilEdit02Icon,
	TableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import type { MutableRefObject, ReactNode } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeAppearance, FsEntry } from "../../lib/tauri";
import { FolderPlus, Trash2 } from "../Icons";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { isEditorTextColor } from "../editor/textColors";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";
import { FileTreeAppearanceMenu } from "./FileTreeAppearanceMenu";
import {
	FILE_TREE_ENTRY_SENSORS,
	FILE_TREE_ENTRY_TYPE,
	fileTreeEntryDragId,
} from "./fileTreeDnd";
import {
	buildRowStyle,
	rowVariants,
	springTransition,
} from "./fileTreeItemHelpers";

function DirectoryRenameInput({
	initialName,
	relPath,
	onCommitRename,
	onCancelRename,
}: {
	initialName: string;
	relPath: string;
	onCommitRename: (dirPath: string, nextName: string) => Promise<void> | void;
	onCancelRename: () => void;
}) {
	const [draftName, setDraftName] = useState(initialName);
	const renameSubmittedRef = useRef(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const commitRename = async () => {
		if (renameSubmittedRef.current) return;
		renameSubmittedRef.current = true;
		await onCommitRename(relPath, draftName);
	};

	return (
		<input
			ref={inputRef}
			className="fileTreeRenameInput"
			value={draftName}
			placeholder="New Folder"
			onChange={(event) => setDraftName(event.target.value)}
			onMouseDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
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
	);
}

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
	onCreateFromTemplateInDir: (dirPath: string) => unknown;
	onNewDatabaseInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	appearance?: FileTreeAppearance | null;
	onChangeAppearance: (appearance: FileTreeAppearance) => void;
	fileCount?: number | null;
	onMoveClickSuppressRef: MutableRefObject<boolean>;
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
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDeletePath,
	appearance,
	onChangeAppearance,
	fileCount,
	onMoveClickSuppressRef,
}: FileTreeDirItemProps) {
	const customColor =
		appearance?.color && isEditorTextColor(appearance.color)
			? appearance.color
			: null;
	const rowStyle = buildRowStyle(depth, entry.rel_path, customColor);
	const displayDirName = entry.name.trim() || "New Folder";
	const {
		ref: draggableRef,
		handleRef,
		isDragging,
	} = useDraggable({
		id: fileTreeEntryDragId("dir", entry.rel_path),
		type: FILE_TREE_ENTRY_TYPE,
		sensors: FILE_TREE_ENTRY_SENSORS,
		data: {
			path: entry.rel_path,
			kind: "dir",
		},
	});
	const { ref: droppableRef, isDropTarget } = useDroppable({
		id: `file-tree-dir:${entry.rel_path}`,
		data: { targetDirPath: entry.rel_path },
		accept: FILE_TREE_ENTRY_TYPE,
	});
	const setRowRef = useCallback(
		(element: HTMLButtonElement | null) => {
			draggableRef(element);
			droppableRef(element);
			handleRef(element);
		},
		[draggableRef, droppableRef, handleRef],
	);

	return (
		<li className="fileTreeItem">
			<div className="fileTreeRowShell">
				{isRenaming ? (
					<div className="fileTreeRow" style={rowStyle}>
						<DirectoryRenameInput
							key={`${entry.rel_path}:${entry.name}`}
							initialName={entry.name.trim() || "New Folder"}
							relPath={entry.rel_path}
							onCommitRename={onCommitRename}
							onCancelRename={onCancelRename}
						/>
					</div>
				) : (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<m.button
								ref={setRowRef}
								type="button"
								className="fileTreeRow"
								onClick={() => {
									if (onMoveClickSuppressRef.current) return;
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
								data-draggable="true"
								data-dragging={isDragging ? "true" : undefined}
								data-drop-target={isDropTarget ? "true" : undefined}
								data-has-custom-color={customColor ? "true" : "false"}
							>
								{appearance?.icon ? (
									<DatabaseColumnIcon
										iconName={appearance.icon}
										size={14}
										className="fileTreeChevron fileTreeFolderIcon"
									/>
								) : (
									<HugeiconsIcon
										icon={isExpanded ? Folder03Icon : Folder01Icon}
										size={12}
										strokeWidth={0.9}
										className="fileTreeChevron fileTreeFolderIcon"
									/>
								)}
								<span className="fileTreeName">{displayDirName}</span>
								{typeof fileCount === "number" ? (
									<span className="fileTreeCounts">{fileCount}</span>
								) : null}
							</m.button>
						</ContextMenuTrigger>
						<ContextMenuContent
							className="fileTreeCreateMenu"
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFileInDir(entry.rel_path)}
							>
								<HugeiconsIcon
									icon={PencilEdit02Icon}
									size={14}
									strokeWidth={0.9}
								/>
								Add file
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onCreateFromTemplateInDir(entry.rel_path)}
							>
								<HugeiconsIcon
									icon={DocumentCodeIcon}
									size={14}
									strokeWidth={0.9}
								/>
								Create from template
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewDatabaseInDir(entry.rel_path)}
							>
								<HugeiconsIcon icon={TableIcon} size={14} strokeWidth={0.9} />
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
								<HugeiconsIcon
									icon={PencilEdit02Icon}
									size={14}
									strokeWidth={0.9}
								/>
								Rename
							</ContextMenuItem>
							<FileTreeAppearanceMenu
								itemKind="dir"
								appearance={appearance}
								onChangeAppearance={onChangeAppearance}
							/>
							<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
							<ContextMenuItem
								variant="destructive"
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
