import {
	Copy01Icon,
	DocumentCodeIcon,
	FileViewIcon,
	PencilEdit02Icon,
	PinIcon,
	PinOffIcon,
	TableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import type { KeyboardEvent, MouseEvent } from "react";
import { memo, useEffect, useRef, useState } from "react";
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
	buildRowStyle,
	rowVariants,
	splitEditableFileName,
	springTransition,
} from "./fileTreeItemHelpers";
import { basename, getFileTypeInfo } from "./fileTypeUtils";

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
	onArrowNavigate?: (
		path: string,
		direction: -1 | 1,
		currentTarget: HTMLButtonElement,
	) => void;
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
	onArrowNavigate,
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
	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameSubmittedRef = useRef(false);
	const [draftName, setDraftName] = useState(fileStem || entry.name);
	const iconColor = customColor ? "var(--file-tree-row-icon-color)" : color;

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
								data-has-custom-color={customColor ? "true" : "false"}
								data-file-tree-file="true"
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
								<HugeiconsIcon
									icon={FileViewIcon}
									size={14}
									strokeWidth={0.9}
								/>
								Open
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
