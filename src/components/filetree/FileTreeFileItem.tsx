import { useDraggable } from "@dnd-kit/react";
import {
	Copy01Icon,
	DocumentCodeIcon,
	FileViewIcon,
	FolderOpenIcon,
	PencilEdit02Icon,
	PinIcon,
	PinOffIcon,
	TableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../../lib/tauri";
import type {
	FileTreeAppearance,
	FsEntry,
	NoteTaskSummary,
} from "../../lib/tauri";
import { basename, splitEditableFileName } from "../../utils/path";
import { FolderPlus, Trash2 } from "../Icons";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { isEditorTextColor } from "../editor/textColors";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
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
import { getFileTypeInfo } from "./fileTypeUtils";

const DEFAULT_MOVE_CLICK_SUPPRESS_REF: MutableRefObject<boolean> = {
	current: false,
};

function FileRenameInput({
	initialName,
	relPath,
	fileStem,
	fileExt,
	onCommitRename,
	onCancelRename,
}: {
	initialName: string;
	relPath: string;
	fileStem: string;
	fileExt: string;
	onCommitRename: (path: string, nextName: string) => Promise<void> | void;
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
		const nextStem = draftName.trim() || fileStem || initialName.trim();
		const nextName = `${nextStem}${fileExt}`;
		await onCommitRename(relPath, nextName);
	};

	return (
		<input
			ref={inputRef}
			className="plainTextInput fileTreeRenameInput"
			value={draftName}
			placeholder="Untitled"
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

interface FileTreeFileItemProps {
	entry: FsEntry;
	depth: number;
	isActive: boolean;
	isRenaming: boolean;
	onOpenFile: (filePath: string) => void;
	onPrefetchFile?: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => unknown;
	onCreateFromTemplateInDir: (dirPath: string) => unknown;
	onNewDatabaseInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
	onDuplicateFile: (path: string) => unknown;
	onStartRename: () => void;
	onCommitRename: (path: string, nextName: string) => Promise<void> | void;
	onCancelRename: () => void;
	parentDirPath: string;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	appearance?: FileTreeAppearance | null;
	onChangeAppearance: (appearance: FileTreeAppearance) => void;
	isPinned: boolean;
	onTogglePinned: (path: string) => Promise<void> | void;
	onMoveClickSuppressRef?: MutableRefObject<boolean>;
	onArrowNavigate?: (
		path: string,
		direction: -1 | 1,
		currentTarget: HTMLButtonElement,
	) => void;
	taskSummary?: NoteTaskSummary | null;
	previewText?: string | null;
}

export const FileTreeFileItem = memo(function FileTreeFileItem({
	entry,
	depth,
	isActive,
	isRenaming,
	onOpenFile,
	onPrefetchFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onStartRename,
	onCommitRename,
	onCancelRename,
	parentDirPath,
	onDeletePath,
	appearance,
	onChangeAppearance,
	isPinned,
	onTogglePinned,
	onMoveClickSuppressRef = DEFAULT_MOVE_CLICK_SUPPRESS_REF,
	onArrowNavigate,
	taskSummary = null,
	previewText = null,
}: FileTreeFileItemProps) {
	const customColor =
		appearance?.color && isEditorTextColor(appearance.color)
			? appearance.color
			: null;
	const rowStyle = buildRowStyle(depth, entry.rel_path, customColor);
	const { Icon, color, label } = getFileTypeInfo(
		entry.rel_path,
		entry.is_markdown,
	);
	const { stem: fileStem, ext: fileExt } = splitEditableFileName(entry.name);
	const isMd = fileExt.toLowerCase() === ".md";
	const displayStem =
		fileStem.trim() ||
		basename(entry.rel_path)
			.replace(/\.[^.]+$/, "")
			.trim() ||
		"Untitled";
	const extBadge = !isMd && fileExt ? fileExt.slice(1) : "";
	const iconColor = customColor ? "var(--file-tree-row-icon-color)" : color;
	const {
		ref: draggableRef,
		handleRef,
		isDragging,
	} = useDraggable({
		id: fileTreeEntryDragId("file", entry.rel_path),
		type: FILE_TREE_ENTRY_TYPE,
		sensors: FILE_TREE_ENTRY_SENSORS,
		data: {
			path: entry.rel_path,
			kind: "file",
		},
	});
	const setRowRef = useCallback(
		(element: HTMLButtonElement | null) => {
			draggableRef(element);
			handleRef(element);
		},
		[draggableRef, handleRef],
	);

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		if (!onArrowNavigate) return;
		event.preventDefault();
		event.stopPropagation();
		onArrowNavigate(
			entry.rel_path,
			event.key === "ArrowDown" ? 1 : -1,
			event.currentTarget,
		);
	};
	const handleRevealInFinder = useCallback(async () => {
		try {
			await invoke("space_reveal_path", { path: entry.rel_path });
		} catch (error) {
			console.error("Failed to show file in Finder", error);
		}
	}, [entry.rel_path]);

	return (
		<li className={isActive ? "fileTreeItem active" : "fileTreeItem"}>
			<div className="fileTreeRowShell">
				{isRenaming ? (
					<div
						className="fileTreeRow"
						style={rowStyle}
						data-file-tree-path={entry.rel_path}
					>
						<span className="fileTreeLeadingSpacer" aria-hidden="true" />
						<FileRenameInput
							key={`${entry.rel_path}:${entry.name}`}
							initialName={fileStem || entry.name.trim() || "Untitled"}
							relPath={entry.rel_path}
							fileStem={fileStem}
							fileExt={fileExt}
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
								className={
									previewText ? "fileTreeRow fileTreePreviewRow" : "fileTreeRow"
								}
								onClick={() => {
									if (onMoveClickSuppressRef.current) return;
									onOpenFile(entry.rel_path);
								}}
								onMouseEnter={() => onPrefetchFile?.(entry.rel_path)}
								onFocus={() => onPrefetchFile?.(entry.rel_path)}
								onKeyDown={handleKeyDown}
								style={rowStyle}
								title={`${entry.rel_path} (${label})`}
								variants={rowVariants}
								whileHover="hover"
								whileTap="tap"
								animate={isActive ? "active" : "idle"}
								transition={springTransition}
								data-draggable="true"
								data-dragging={isDragging ? "true" : undefined}
								data-has-custom-color={customColor ? "true" : "false"}
								data-file-tree-file="true"
								data-file-tree-kind="file"
								data-file-tree-path={entry.rel_path}
							>
								{appearance?.icon ? (
									<DatabaseColumnIcon
										iconName={appearance.icon}
										size={14}
										className="fileTreeIcon"
									/>
								) : (
									<Icon
										size={14}
										className="fileTreeIcon"
										style={{ color: iconColor }}
										aria-hidden="true"
									/>
								)}
								<span className="fileTreeFileText">
									<span className="fileTreeName">{displayStem}</span>
									{previewText ? (
										<span className="fileTreeFilePreview">{previewText}</span>
									) : null}
								</span>
								{taskSummary && taskSummary.total_count > 0 ? (
									<TaskProgressIndicator
										summary={taskSummary}
										className="fileTreeTaskProgress"
									/>
								) : null}
								{extBadge && (
									<span className="fileTreeExtBadge">{extBadge}</span>
								)}
							</m.button>
						</ContextMenuTrigger>
						<ContextMenuContent
							className="fileTreeCreateMenu"
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onOpenFile(entry.rel_path)}
							>
								<HugeiconsIcon
									icon={FileViewIcon}
									size={14}
									strokeWidth={0.9}
								/>
								Open
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void handleRevealInFinder()}
							>
								<HugeiconsIcon
									icon={FolderOpenIcon}
									size={14}
									strokeWidth={0.9}
								/>
								Show in Finder
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
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onDuplicateFile(entry.rel_path)}
							>
								<HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={0.9} />
								Duplicate file
							</ContextMenuItem>
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onTogglePinned(entry.rel_path)}
							>
								<HugeiconsIcon
									icon={isPinned ? PinOffIcon : PinIcon}
									size={14}
									strokeWidth={0.9}
								/>
								{isPinned ? "Unpin file" : "Pin file"}
							</ContextMenuItem>
							<FileTreeAppearanceMenu
								itemKind="file"
								appearance={appearance}
								onChangeAppearance={onChangeAppearance}
							/>
							<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFileInDir(parentDirPath)}
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
								onSelect={() => void onCreateFromTemplateInDir(parentDirPath)}
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
								onSelect={() => void onNewDatabaseInDir(parentDirPath)}
							>
								<HugeiconsIcon icon={TableIcon} size={14} strokeWidth={0.9} />
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
								variant="destructive"
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
