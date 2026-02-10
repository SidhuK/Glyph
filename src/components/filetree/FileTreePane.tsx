import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { memo, useCallback, useState } from "react";
import type { DirChildSummary, FsEntry } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import { Database, FolderPlus, Plus } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { FileTreeDirItem, FileTreeFileItem } from "./FileTreeItem";

interface FileTreePaneProps {
	vaultName?: string;
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	summariesByParentDir: Record<string, DirChildSummary[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (
		path: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
}

const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const FileTreePane = memo(function FileTreePane({
	vaultName,
	rootEntries,
	childrenByDir,
	summariesByParentDir,
	expandedDirs,
	activeFilePath,
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
}: FileTreePaneProps) {
	const [renamingPath, setRenamingPath] = useState<string | null>(null);

	const handleRootClick = useCallback(() => {
		onSelectDir("");
	}, [onSelectDir]);

	const handleCreateFolder = useCallback(
		async (dirPath: string) => {
			const created = await onNewFolderInDir(dirPath);
			if (created) {
				setRenamingPath(created);
			}
		},
		[onNewFolderInDir],
	);

	const handleCommitDirRename = useCallback(
		async (dirPath: string, nextName: string) => {
			const renamed = await onRenameDir(dirPath, nextName, "dir");
			if (renamed) {
				setRenamingPath(null);
			}
		},
		[onRenameDir],
	);

	const handleCommitFileRename = useCallback(
		async (path: string, nextName: string) => {
			const renamed = await onRenameDir(path, nextName, "file");
			if (renamed) {
				setRenamingPath(null);
			}
		},
		[onRenameDir],
	);

	const renderEntries = (
		entries: FsEntry[],
		parentDepth: number,
		parentDirPath: string,
	) => {
		if (entries.length === 0) return null;
		const listDepth = parentDepth + 1;
		const listStyle = {
			"--tree-depth": listDepth,
			"--tree-line-x": `${listDepth * 10 + 6}px`,
			"--tree-line-opacity": listDepth === 0 ? 0 : 0.85,
		} as CSSProperties;

		const summaryMap = new Map(
			(summariesByParentDir[parentDirPath] ?? []).map(
				(s) => [s.dir_rel_path, s] as const,
			),
		);

		return (
			<ul className="fileTreeList" style={listStyle}>
				{entries.map((e, index) => {
					const isDir = e.kind === "dir";
					const depth = parentDepth + 1;
					const rowKey =
						e.rel_path.trim() || `${e.kind}:${e.name.trim() || `row-${index}`}`;

					if (isDir) {
						const isExpanded = expandedDirs.has(e.rel_path);
						const children = childrenByDir[e.rel_path];
						const summary = summaryMap.get(e.rel_path) ?? null;

						return (
							<FileTreeDirItem
								key={rowKey}
								entry={e}
								depth={depth}
								isExpanded={isExpanded}
								isRenaming={renamingPath === e.rel_path}
								summary={summary}
								onToggleDir={onToggleDir}
								onSelectDir={onSelectDir}
								onNewFileInDir={onNewFileInDir}
								onNewFolderInDir={handleCreateFolder}
								onStartRename={() => setRenamingPath(e.rel_path)}
								onCommitRename={handleCommitDirRename}
								onCancelRename={() => setRenamingPath(null)}
							>
								{children && renderEntries(children, depth, e.rel_path)}
							</FileTreeDirItem>
						);
					}

					return (
						<FileTreeFileItem
							key={rowKey}
							entry={e}
							depth={depth}
							isActive={e.rel_path === activeFilePath}
							onOpenFile={onOpenFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={handleCreateFolder}
							isRenaming={renamingPath === e.rel_path}
							onStartRename={() => setRenamingPath(e.rel_path)}
							onCommitRename={handleCommitFileRename}
							onCancelRename={() => setRenamingPath(null)}
							parentDirPath={parentDir(e.rel_path)}
						/>
					);
				})}
			</ul>
		);
	};

	return (
		<motion.aside
			className="fileTreePane"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			<div className="fileTreeHeader">
				{vaultName && (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<button
								type="button"
								className="fileTreeVaultName"
								onClick={handleRootClick}
								title="Go to vault root"
							>
								<Database size={14} />
								<span className="fileTreeVaultNameText">{vaultName}</span>
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent className="fileTreeCreateMenu">
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void onNewFileInDir("")}
							>
								<Plus size={14} />
								Add file
							</ContextMenuItem>
							<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
							<ContextMenuItem
								className="fileTreeCreateMenuItem"
								onSelect={() => void handleCreateFolder("")}
							>
								<FolderPlus size={14} />
								Add folder
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				)}
				<div className="fileTreeHeaderActions">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								title="Add to vault root"
							>
								<Plus size={16} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="fileTreeCreateMenu">
							<DropdownMenuItem
								className="fileTreeCreateMenuItem"
								onClick={() => void onNewFileInDir("")}
							>
								<Plus size={14} />
								Add file
							</DropdownMenuItem>
							<DropdownMenuSeparator className="fileTreeCreateMenuSeparator" />
							<DropdownMenuItem
								className="fileTreeCreateMenuItem"
								onClick={() => void handleCreateFolder("")}
							>
								<FolderPlus size={14} />
								Add folder
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			{rootEntries.length ? (
				<div className="fileTreeScroll">
					{renderEntries(rootEntries, -1, "")}
				</div>
			) : (
				<motion.div
					className="fileTreeEmpty"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.2 }}
				>
					No files found.
				</motion.div>
			)}
		</motion.aside>
	);
});
