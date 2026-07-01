import { useDraggable } from "@dnd-kit/react";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import type { KeyboardEvent, MouseEvent, MutableRefObject } from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useSpace } from "../../contexts";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { buildPathCopyMenuItems } from "../../lib/pathClipboard";
import { invoke } from "../../lib/tauri";
import type {
	FileTreeAppearance,
	FsEntry,
	NoteTaskSummary,
} from "../../lib/tauri";
import { basename, splitEditableFileName } from "../../utils/path";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
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
	onRequestCreateFolder: (dirPath: string) => unknown;
	onDuplicateFile: (path: string) => unknown;
	onStartRename: () => void;
	onCommitRename: (path: string, nextName: string) => Promise<void> | void;
	onCancelRename: () => void;
	parentDirPath: string;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	appearance?: FileTreeAppearance | null;
	onChangeAppearance?: (appearance: FileTreeAppearance) => void;
	onOpenAppearancePicker?: () => void;
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
	onRequestCreateFolder,
	onDuplicateFile,
	onStartRename,
	onCommitRename,
	onCancelRename,
	parentDirPath,
	onDeletePath,
	appearance,
	onOpenAppearancePicker,
	isPinned,
	onTogglePinned,
	onMoveClickSuppressRef = DEFAULT_MOVE_CLICK_SUPPRESS_REF,
	onArrowNavigate,
	taskSummary = null,
	previewText = null,
}: FileTreeFileItemProps) {
	const { spacePath } = useSpace();
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
	const handleContextMenu = useCallback(
		(event: MouseEvent) => {
			void showNativeContextMenu(event, [
				{
					label: "Open",
					action: () => void onOpenFile(entry.rel_path),
				},
				{
					label: "Show in Finder",
					action: () => void handleRevealInFinder(),
				},
				...buildPathCopyMenuItems(spacePath, entry.rel_path),
				{ type: "separator" },
				{
					label: "Rename",
					action: onStartRename,
				},
				{
					label: "Duplicate file",
					action: () => void onDuplicateFile(entry.rel_path),
				},
				{
					label: isPinned ? "Unpin file" : "Pin file",
					action: () => void onTogglePinned(entry.rel_path),
				},
				fileTreeAppearanceNativeMenu(
					onOpenAppearancePicker ?? (() => undefined),
				),
				{ type: "separator" },
				{
					label: "Add file",
					action: () => void onNewFileInDir(parentDirPath),
				},
				{
					label: "Create from template",
					action: () => void onCreateFromTemplateInDir(parentDirPath),
				},
				{
					label: "Add folder",
					action: () => void onRequestCreateFolder(parentDirPath),
				},
				{ type: "separator" },
				{
					label: "Delete file",
					action: () => onDeletePath(entry.rel_path, "file"),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show file context menu", error);
			});
		},
		[
			entry.rel_path,
			handleRevealInFinder,
			isPinned,
			onOpenAppearancePicker,
			onCreateFromTemplateInDir,
			onDeletePath,
			onDuplicateFile,
			onNewFileInDir,
			onRequestCreateFolder,
			onOpenFile,
			onStartRename,
			onTogglePinned,
			parentDirPath,
			spacePath,
		],
	);

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
						onContextMenu={handleContextMenu}
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
								size="var(--icon-md)"
								className="fileTreeIcon"
							/>
						) : (
							<Icon
								size="var(--icon-md)"
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
						{isPinned ? (
							<HugeiconsIcon
								icon={StarIcon}
								size="var(--icon-sm)"
								strokeWidth={0.9}
								className="fileTreePinIcon"
							/>
						) : null}
						{taskSummary && taskSummary.total_count > 0 ? (
							<TaskProgressIndicator
								summary={taskSummary}
								className="fileTreeTaskProgress"
							/>
						) : null}
						{extBadge && <span className="fileTreeExtBadge">{extBadge}</span>}
					</m.button>
				)}
			</div>
		</li>
	);
});
