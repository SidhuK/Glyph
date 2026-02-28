import { m } from "motion/react";
import type { CSSProperties } from "react";
import { memo, useCallback, useState } from "react";
import type { FsEntry } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import { springPresets } from "../ui/animations";
import { FileTreeDirItem } from "./FileTreeDirItem";
import { FileTreeFileItem } from "./FileTreeFileItem";

interface FileTreePaneProps {
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	activeDirPath: string | null;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (
		path: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
}

const springTransition = springPresets.bouncy;

interface TreeEntriesProps {
	entries: FsEntry[];
	parentDepth: number;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	activeDirPath: string | null;
	renamingPath: string | null;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<void>;
	onStartRename: (path: string) => void;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<void>;
	onCommitFileRename: (path: string, nextName: string) => Promise<void>;
	onCancelRename: () => void;
}

function TreeEntries({
	entries,
	parentDepth,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	activeDirPath,
	renamingPath,
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFileInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDeletePath,
	onStartRename,
	onCommitDirRename,
	onCommitFileRename,
	onCancelRename,
}: TreeEntriesProps) {
	if (entries.length === 0) return null;
	const listDepth = parentDepth + 1;
	const listStyle = {
		"--tree-depth": listDepth,
		"--tree-line-x": `${listDepth * 10 + 6}px`,
		"--tree-line-opacity": listDepth === 0 ? 0 : 0.85,
	} as CSSProperties;

	return (
		<ul className="fileTreeList" style={listStyle}>
			{entries.map((e) => {
				const isDir = e.kind === "dir";
				const depth = parentDepth + 1;
				const rowKey =
					e.rel_path.trim() || `${e.kind}:${e.name.trim()}:${depth}`;

				if (isDir) {
					const isExpanded = expandedDirs.has(e.rel_path);
					const children = childrenByDir[e.rel_path];

					return (
						<FileTreeDirItem
							key={rowKey}
							entry={e}
							depth={depth}
							isExpanded={isExpanded}
							isActive={e.rel_path === activeDirPath}
							isRenaming={renamingPath === e.rel_path}
							onToggleDir={onToggleDir}
							onSelectDir={onSelectDir}
							onNewFileInDir={onNewFileInDir}
							onNewDatabaseInDir={onNewDatabaseInDir}
							onNewFolderInDir={onNewFolderInDir}
							onDeletePath={onDeletePath}
							onStartRename={() => onStartRename(e.rel_path)}
							onCommitRename={onCommitDirRename}
							onCancelRename={onCancelRename}
						>
							{children && (
								<TreeEntries
									entries={children}
									parentDepth={depth}
									childrenByDir={childrenByDir}
									expandedDirs={expandedDirs}
									activeFilePath={activeFilePath}
									activeDirPath={activeDirPath}
									renamingPath={renamingPath}
									onToggleDir={onToggleDir}
									onSelectDir={onSelectDir}
									onOpenFile={onOpenFile}
									onNewFileInDir={onNewFileInDir}
									onNewDatabaseInDir={onNewDatabaseInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDeletePath={onDeletePath}
									onStartRename={onStartRename}
									onCommitDirRename={onCommitDirRename}
									onCommitFileRename={onCommitFileRename}
									onCancelRename={onCancelRename}
								/>
							)}
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
						onNewDatabaseInDir={onNewDatabaseInDir}
						onNewFolderInDir={onNewFolderInDir}
						isRenaming={renamingPath === e.rel_path}
						onStartRename={() => onStartRename(e.rel_path)}
						onCommitRename={onCommitFileRename}
						onCancelRename={onCancelRename}
						parentDirPath={parentDir(e.rel_path)}
						onDeletePath={onDeletePath}
					/>
				);
			})}
		</ul>
	);
}

export const FileTreePane = memo(function FileTreePane({
	rootEntries,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	activeDirPath,
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFileInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onRenameDir,
	onDeletePath,
}: FileTreePaneProps) {
	const [renamingPath, setRenamingPath] = useState<string | null>(null);

	const handleCreateFolder = useCallback(
		async (dirPath: string) => {
			const created = await onNewFolderInDir(dirPath);
			if (created) {
				setRenamingPath(created);
			}
			return created;
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

	const handleDeletePath = useCallback(
		async (path: string, kind: "dir" | "file") => {
			const { confirm } = await import("@tauri-apps/plugin-dialog");
			const noun = kind === "dir" ? "folder" : "file";
			const confirmed = await confirm(`Delete this ${noun}?`, {
				title: "Confirm delete",
				okLabel: "Delete",
				cancelLabel: "Cancel",
			});
			if (!confirmed) return;
			await onDeletePath(path, kind);
		},
		[onDeletePath],
	);

	return (
		<m.aside
			className="fileTreePane"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			{rootEntries.length ? (
				<div className="fileTreeScroll">
					<TreeEntries
						entries={rootEntries}
						parentDepth={-1}
						childrenByDir={childrenByDir}
						expandedDirs={expandedDirs}
						activeFilePath={activeFilePath}
						activeDirPath={activeDirPath}
						renamingPath={renamingPath}
						onToggleDir={onToggleDir}
						onSelectDir={onSelectDir}
						onOpenFile={onOpenFile}
						onNewFileInDir={onNewFileInDir}
						onNewDatabaseInDir={onNewDatabaseInDir}
						onNewFolderInDir={handleCreateFolder}
						onDeletePath={handleDeletePath}
						onStartRename={setRenamingPath}
						onCommitDirRename={handleCommitDirRename}
						onCommitFileRename={handleCommitFileRename}
						onCancelRename={() => setRenamingPath(null)}
					/>
				</div>
			) : (
				<m.div
					className="fileTreeEmpty"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.2 }}
				>
					No files found.
				</m.div>
			)}
		</m.aside>
	);
});
