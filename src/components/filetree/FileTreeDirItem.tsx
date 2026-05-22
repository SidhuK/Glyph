import { useDraggable, useDroppable } from "@dnd-kit/react";
import {
	ArrowRight02Icon,
	Folder01Icon,
	Folder03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import type { MouseEvent, MutableRefObject, ReactNode } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import type { FileTreeAppearance, FsEntry } from "../../lib/tauri";
import { Plus } from "../Icons";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { isEditorTextColor } from "../editor/textColors";
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
import { fileTreeAppearanceNativeMenu } from "./fileTreeNativeContextMenu";

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
			className="plainTextInput fileTreeRenameInput"
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
	onNewFolderInDir: (dirPath: string) => unknown;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	onEnterDir?: (dirPath: string) => void;
	appearance?: FileTreeAppearance | null;
	onOpenAppearancePicker: () => void;
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
	onNewFolderInDir,
	onDeletePath,
	onEnterDir,
	appearance,
	onOpenAppearancePicker,
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
	const handleContextMenu = useCallback(
		(event: MouseEvent) => {
			void showNativeContextMenu(event, [
				{
					label: "Add file",
					action: () => void onNewFileInDir(entry.rel_path),
				},
				{
					label: "Create from template",
					action: () => void onCreateFromTemplateInDir(entry.rel_path),
				},
				{
					label: "Add folder",
					action: () => void onNewFolderInDir(entry.rel_path),
				},
				{ type: "separator" },
				{
					label: "Rename",
					action: onStartRename,
				},
				fileTreeAppearanceNativeMenu(onOpenAppearancePicker),
				{ type: "separator" },
				{
					label: "Delete folder",
					action: () => onDeletePath(entry.rel_path, "dir"),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show folder context menu", error);
			});
		},
		[
			entry.rel_path,
			onOpenAppearancePicker,
			onCreateFromTemplateInDir,
			onDeletePath,
			onNewFileInDir,
			onNewFolderInDir,
			onStartRename,
		],
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
					<>
						<m.button
							ref={setRowRef}
							type="button"
							className="fileTreeRow"
							onClick={() => {
								if (onMoveClickSuppressRef.current) return;
								onSelectDir(entry.rel_path);
								onToggleDir(entry.rel_path);
							}}
							onContextMenu={handleContextMenu}
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
							data-file-tree-kind="dir"
							data-file-tree-path={entry.rel_path}
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
						{onEnterDir ? (
							<div className="fileTreeRowActions">
								<button
									type="button"
									className="fileTreeRowAction"
									title={`Add file to ${displayDirName}`}
									aria-label={`Add file to ${displayDirName}`}
									onClick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										void onNewFileInDir(entry.rel_path);
									}}
								>
									<Plus size={13} />
								</button>
								<button
									type="button"
									className="fileTreeRowAction"
									title={`Open ${displayDirName}`}
									aria-label={`Open ${displayDirName}`}
									onClick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										onEnterDir(entry.rel_path);
									}}
								>
									<HugeiconsIcon
										icon={ArrowRight02Icon}
										size={13}
										strokeWidth={0.9}
									/>
								</button>
							</div>
						) : null}
					</>
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
