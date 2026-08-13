import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { useDraggable } from "@dnd-kit/react";
import { StarIcon } from "@hugeicons/core-free-icons";
import { m } from "motion/react";
import type {
	CSSProperties,
	KeyboardEvent,
	MouseEvent,
	MutableRefObject,
	Ref,
} from "react";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEditorContext, useSpace } from "../../contexts";
import { useHoverPrefetch } from "../../hooks/useHoverPrefetch";
import { openMarkdownInExternalWindow } from "../../lib/externalMarkdown";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { buildPathCopyMenuItems } from "../../lib/pathClipboard";
import { invoke } from "../../lib/tauri";
import type {
	FileTreeAppearance,
	FsEntry,
	NoteTaskSummary,
} from "../../lib/tauri";
import { basename, splitEditableFileName } from "../../utils/path";
import { InlineRenameInput } from "../InlineRenameInput";
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
	onCommitRename: (path: string, nextName: string) => Promise<boolean>;
	onCancelRename: () => void;
	parentDirPath: string;
	onDeletePath: (path: string, kind: "dir" | "file") => void;
	appearance?: FileTreeAppearance | null;
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
	virtualRowRef?: Ref<HTMLLIElement>;
	virtualRowStyle?: CSSProperties;
	virtualRowIndex?: number;
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
	virtualRowRef,
	virtualRowStyle,
	virtualRowIndex,
}: FileTreeFileItemProps) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { getEditorState, saveCurrentEditor } = useEditorContext();
	const customColor =
		appearance?.color && isEditorTextColor(appearance.color)
			? appearance.color
			: null;
	const rowStyle = buildRowStyle(depth, entry.rel_path, customColor);
	const { Icon, color, label } = getFileTypeInfo(
		entry.rel_path,
		entry.is_markdown,
	);
	const { cancelHoverPrefetch, hoverPrefetchProps } = useHoverPrefetch(() => {
		onPrefetchFile?.(entry.rel_path);
	});
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
	const handleOpenInSeparateWindow = useCallback(async () => {
		const editorState = getEditorState();
		if (editorState?.relPath === entry.rel_path && editorState.isDirty) {
			await saveCurrentEditor();
		}
		await openMarkdownInExternalWindow(entry.rel_path);
	}, [entry.rel_path, getEditorState, saveCurrentEditor]);
	const handleContextMenu = useCallback(
		(event: MouseEvent) => {
			void showNativeContextMenu(event, [
				{
					label: t("fileTree.open"),
					action: () => void onOpenFile(entry.rel_path),
				},
				...(entry.is_markdown
					? [
							{
								label: t("fileTree.openInNewWindow"),
								action: () => void handleOpenInSeparateWindow(),
							},
						]
					: []),
				{
					label: t("fileTree.showInFinder"),
					action: () => void handleRevealInFinder(),
				},
				...buildPathCopyMenuItems(spacePath, entry.rel_path, {
					includeDeeplink: entry.is_markdown,
				}),
				{ type: "separator" },
				{
					label: t("fileTree.rename"),
					action: onStartRename,
				},
				{
					label: t("fileTree.duplicateFile"),
					action: () => void onDuplicateFile(entry.rel_path),
				},
				{
					label: isPinned ? t("fileTree.unpinFile") : t("fileTree.pinFile"),
					action: () => void onTogglePinned(entry.rel_path),
				},
				fileTreeAppearanceNativeMenu(
					onOpenAppearancePicker ?? (() => undefined),
				),
				{ type: "separator" },
				{
					label: t("fileTree.addFile"),
					action: () => void onNewFileInDir(parentDirPath),
				},
				{
					label: t("fileTree.createFromTemplate"),
					action: () => void onCreateFromTemplateInDir(parentDirPath),
				},
				{
					label: t("fileTree.addFolder"),
					action: () => void onRequestCreateFolder(parentDirPath),
				},
				{ type: "separator" },
				{
					label: t("fileTree.deleteFile"),
					action: () => onDeletePath(entry.rel_path, "file"),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show file context menu", error);
			});
		},
		[
			entry.is_markdown,
			entry.rel_path,
			handleRevealInFinder,
			isPinned,
			onOpenAppearancePicker,
			onCreateFromTemplateInDir,
			onDeletePath,
			onDuplicateFile,
			onNewFileInDir,
			onRequestCreateFolder,
			handleOpenInSeparateWindow,
			onOpenFile,
			onStartRename,
			onTogglePinned,
			parentDirPath,
			spacePath,
			t,
		],
	);

	return (
		<li
			ref={virtualRowRef}
			className={isActive ? "fileTreeItem active" : "fileTreeItem"}
			style={virtualRowStyle}
			data-index={virtualRowIndex}
		>
			<div className="fileTreeRowShell">
				{isRenaming ? (
					<div
						className="fileTreeRow"
						style={rowStyle}
						data-file-tree-kind="file"
						data-file-tree-path={entry.rel_path}
					>
						<span className="fileTreeLeadingSpacer" aria-hidden="true" />
						<InlineRenameInput
							key={`${entry.rel_path}:${entry.name}`}
							initialValue={fileStem || entry.name.trim() || "Untitled"}
							className="plainTextInput fileTreeRenameInput"
							placeholder="Untitled"
							containPointerEvents
							onCommit={(draftName) => {
								const nextStem =
									draftName.trim() || fileStem || entry.name.trim();
								return onCommitRename(entry.rel_path, `${nextStem}${fileExt}`);
							}}
							onCancel={onCancelRename}
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
							cancelHoverPrefetch();
							if (onMoveClickSuppressRef.current) {
								onMoveClickSuppressRef.current = false;
								return;
							}
							onOpenFile(entry.rel_path);
						}}
						onContextMenu={handleContextMenu}
						{...hoverPrefetchProps}
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
