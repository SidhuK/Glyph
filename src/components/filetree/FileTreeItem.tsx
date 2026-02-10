import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";
import type { DirChildSummary, FsEntry } from "../../lib/tauri";
import { FolderClosed, FolderOpen, FolderPlus, Plus } from "../Icons";
import { basename, getFileTypeInfo } from "./fileTypeUtils";

const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

const iconVariants = {
	idle: { scale: 1, rotate: 0 },
	hover: { scale: 1.1, rotate: 5 },
	active: {
		scale: 1.15,
		rotate: [0, 5, -5, 0],
		transition: {
			rotate: {
				duration: 0.4,
				repeat: Number.POSITIVE_INFINITY,
				repeatDelay: 2,
			},
		},
	},
	tap: { scale: 0.95 },
};

const rowVariants = {
	idle: { x: 0, backgroundColor: "transparent" },
	hover: { x: 4, backgroundColor: "var(--bg-hover)" },
	active: { backgroundColor: "var(--selection-bg-muted)" },
	tap: { scale: 0.98 },
};

function truncateMiddle(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	if (maxChars <= 4) return `${text.slice(0, maxChars)}...`;
	const keep = maxChars - 3;
	const head = Math.ceil(keep / 2);
	const tail = Math.floor(keep / 2);
	return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function truncateTreeLabel(name: string, isFile: boolean): string {
	const trimmed = name.trim();
	if (!trimmed) return isFile ? "Untitled.md" : "New Folder";
	if (!isFile) return truncateMiddle(trimmed, 22);
	const dotIndex = trimmed.lastIndexOf(".");
	if (dotIndex > 0 && dotIndex < trimmed.length - 1) {
		const ext = trimmed.slice(dotIndex);
		const base = trimmed.slice(0, dotIndex);
		const maxChars = 24;
		if (trimmed.length <= maxChars) return trimmed;
		const availableBase = maxChars - ext.length - 3;
		if (availableBase >= 4) {
			return `${base.slice(0, availableBase)}...${ext}`;
		}
	}
	return truncateMiddle(trimmed, 24);
}

interface FileTreeDirItemProps {
	entry: FsEntry;
	depth: number;
	isExpanded: boolean;
	isRenaming: boolean;
	summary: DirChildSummary | null;
	children?: ReactNode;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onCommitRename: (dirPath: string, nextName: string) => Promise<void> | void;
	onCancelRename: () => void;
	onNewFileInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
}

export const FileTreeDirItem = memo(function FileTreeDirItem({
	entry,
	depth,
	isExpanded,
	isRenaming,
	summary,
	children,
	onToggleDir,
	onSelectDir,
	onCommitRename,
	onCancelRename,
	onNewFileInDir,
	onNewFolderInDir,
}: FileTreeDirItemProps) {
	const paddingLeft = 10 + depth * 10;
	const rowStyle = {
		paddingLeft,
		"--tree-line-x": `${depth * 10 + 6}px`,
		"--row-indent": `${paddingLeft}px`,
		"--row-line-opacity": depth === 0 ? 0 : 0.85,
	} as CSSProperties;

	const inputRef = useRef<HTMLInputElement | null>(null);
	const renameSubmittedRef = useRef(false);
	const [draftName, setDraftName] = useState(entry.name);
	const displayDirName = truncateTreeLabel(entry.name, false);
	const totalFiles = summary?.total_files_recursive ?? 0;
	const countsLabel = summary && totalFiles > 0 ? String(totalFiles) : "";

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
						<motion.span
							className="fileTreeIcon"
							style={{
								color: isExpanded
									? "var(--text-accent)"
									: "var(--text-tertiary)",
							}}
							animate={{ scale: isExpanded ? 1.1 : 1 }}
							transition={springTransition}
						>
							{isExpanded ? (
								<FolderOpen size={14} />
							) : (
								<FolderClosed size={14} />
							)}
						</motion.span>
						<input
							ref={inputRef}
							className="fileTreeRenameInput"
							value={draftName}
							placeholder="New Folder"
							onChange={(event) => setDraftName(event.target.value)}
							onMouseDown={stopInputEvent}
							onClick={stopInputEvent}
							onBlur={() => {
								void commitRename();
							}}
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
						animate={isExpanded ? "active" : "idle"}
						transition={springTransition}
						title={entry.rel_path || entry.name || "Folder"}
					>
						<motion.span
							className="fileTreeIcon"
							style={{
								color: isExpanded
									? "var(--text-accent)"
									: "var(--text-tertiary)",
							}}
							animate={{ scale: isExpanded ? 1.1 : 1 }}
							transition={springTransition}
						>
							{isExpanded ? (
								<FolderOpen size={14} />
							) : (
								<FolderClosed size={14} />
							)}
						</motion.span>
						<span className="fileTreeName">{displayDirName}</span>
					</motion.button>
				)}
				{!isRenaming ? (
					<RowCreateActions
						dirPath={entry.rel_path}
						onNewFileInDir={onNewFileInDir}
						onNewFolderInDir={onNewFolderInDir}
					/>
				) : null}
				{countsLabel ? (
					<span className="fileTreeCounts" title={`${countsLabel} files`}>
						{countsLabel}
					</span>
				) : null}
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

interface FileTreeFileItemProps {
	entry: FsEntry;
	depth: number;
	isActive: boolean;
	onOpenFile: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
	parentDirPath: string;
}

export const FileTreeFileItem = memo(function FileTreeFileItem({
	entry,
	depth,
	isActive,
	onOpenFile,
	onNewFileInDir,
	onNewFolderInDir,
	parentDirPath,
}: FileTreeFileItemProps) {
	const paddingLeft = 10 + depth * 10;
	const rowStyle = {
		paddingLeft,
		"--tree-line-x": `${depth * 10 + 6}px`,
		"--row-indent": `${paddingLeft}px`,
		"--row-line-opacity": depth === 0 ? 0 : 0.85,
	} as CSSProperties;

	const { Icon, color, label } = getFileTypeInfo(
		entry.rel_path,
		entry.is_markdown,
	);
	const displayFileName = truncateTreeLabel(
		entry.name.trim() || basename(entry.rel_path).trim() || "Untitled.md",
		true,
	);

	return (
		<li className={isActive ? "fileTreeItem active" : "fileTreeItem"}>
			<div className="fileTreeRowShell">
				<motion.button
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
					<motion.span
						className="fileTreeIcon"
						variants={iconVariants}
						animate={isActive ? "active" : "idle"}
						whileHover="hover"
						whileTap="tap"
						style={{ color }}
					>
						<Icon size={14} />
					</motion.span>
					<span className="fileTreeName">{displayFileName}</span>
				</motion.button>
				<RowCreateActions
					dirPath={parentDirPath}
					onNewFileInDir={onNewFileInDir}
					onNewFolderInDir={onNewFolderInDir}
				/>
			</div>
		</li>
	);
});

interface RowCreateActionsProps {
	dirPath: string;
	onNewFileInDir: (dirPath: string) => unknown;
	onNewFolderInDir: (dirPath: string) => unknown;
}

function RowCreateActions({
	dirPath,
	onNewFileInDir,
	onNewFolderInDir,
}: RowCreateActionsProps) {
	const locationLabel = dirPath || "vault root";
	const stopRowEvents = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
	};

	return (
		<div className="fileTreeRowActions">
			<button
				type="button"
				className="fileTreeActionBtn"
				title={`New Markdown file in ${locationLabel}`}
				onMouseDown={stopRowEvents}
				onClick={(event) => {
					stopRowEvents(event);
					void onNewFileInDir(dirPath);
				}}
			>
				<Plus size={12} />
			</button>
			<button
				type="button"
				className="fileTreeActionBtn"
				title={`New folder in ${locationLabel}`}
				onMouseDown={stopRowEvents}
				onClick={(event) => {
					stopRowEvents(event);
					void onNewFolderInDir(dirPath);
				}}
			>
				<FolderPlus size={12} />
			</button>
		</div>
	);
}
