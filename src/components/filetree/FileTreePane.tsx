import { m } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useFileTreeContext, useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import type {
	DirChildSummary,
	FileTreeAppearance,
	FsEntry,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
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
	onCreateFromTemplateInDir: (dirPath: string) => void;
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
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<void>;
	onStartRename: (path: string) => void;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<void>;
	onCommitFileRename: (path: string, nextName: string) => Promise<void>;
	onCancelRename: () => void;
	itemAppearance: Record<string, FileTreeAppearance>;
	folderFileCounts: Record<string, number>;
	showFolderFileCounts: boolean;
	onChangeAppearance: (
		entry: FsEntry,
		appearance: FileTreeAppearance,
	) => Promise<void> | void;
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
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDeletePath,
	onStartRename,
	onCommitDirRename,
	onCommitFileRename,
	onCancelRename,
	itemAppearance,
	folderFileCounts,
	showFolderFileCounts,
	onChangeAppearance,
}: TreeEntriesProps) {
	if (entries.length === 0) return null;

	return (
		<ul className="fileTreeList">
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
							onCreateFromTemplateInDir={onCreateFromTemplateInDir}
							onNewDatabaseInDir={onNewDatabaseInDir}
							onNewFolderInDir={onNewFolderInDir}
							onDeletePath={onDeletePath}
							appearance={itemAppearance[e.rel_path] ?? null}
							fileCount={
								showFolderFileCounts
									? (folderFileCounts[e.rel_path] ?? null)
									: null
							}
							onChangeAppearance={(appearance) =>
								onChangeAppearance(e, appearance)
							}
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
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onNewDatabaseInDir={onNewDatabaseInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDeletePath={onDeletePath}
									onStartRename={onStartRename}
									onCommitDirRename={onCommitDirRename}
									onCommitFileRename={onCommitFileRename}
									onCancelRename={onCancelRename}
									itemAppearance={itemAppearance}
									folderFileCounts={folderFileCounts}
									showFolderFileCounts={showFolderFileCounts}
									onChangeAppearance={onChangeAppearance}
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
						onCreateFromTemplateInDir={onCreateFromTemplateInDir}
						onNewDatabaseInDir={onNewDatabaseInDir}
						onNewFolderInDir={onNewFolderInDir}
						isRenaming={renamingPath === e.rel_path}
						onStartRename={() => onStartRename(e.rel_path)}
						onCommitRename={onCommitFileRename}
						onCancelRename={onCancelRename}
						parentDirPath={parentDir(e.rel_path)}
						onDeletePath={onDeletePath}
						appearance={itemAppearance[e.rel_path] ?? null}
						onChangeAppearance={(appearance) =>
							onChangeAppearance(e, appearance)
						}
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
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onRenameDir,
	onDeletePath,
}: FileTreePaneProps) {
	const { itemAppearance, setItemAppearance } = useFileTreeContext();
	const { spacePath, setError } = useSpace();
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [showFolderFileCounts, setShowFolderFileCounts] = useState(false);
	const [folderFileCounts, setFolderFileCounts] = useState<
		Record<string, number>
	>({});

	useEffect(() => {
		let cancelled = false;
		void loadSettings().then((settings) => {
			if (!cancelled) {
				setShowFolderFileCounts(settings.ui.showFileTreeFolderCounts);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.ui?.showFileTreeFolderCounts === "boolean") {
			setShowFolderFileCounts(payload.ui.showFileTreeFolderCounts);
		}
	});

	const summaryParentDirs = useMemo(() => {
		const parents = new Set<string>([""]);
		for (const dirPath of expandedDirs) {
			parents.add(dirPath);
		}
		return [...parents].sort();
	}, [expandedDirs]);

	useEffect(() => {
		if (!spacePath || !showFolderFileCounts) {
			setFolderFileCounts({});
			return;
		}

		let cancelled = false;

		void Promise.all(
			summaryParentDirs.map((dirPath) =>
				invoke("space_dir_children_summary", dirPath ? { dir: dirPath } : {}),
			),
		)
			.then((resultSets) => {
				if (cancelled) return;
				const nextCounts = Object.fromEntries(
					resultSets.flatMap((summaries) =>
						(summaries as DirChildSummary[]).map((summary) => [
							summary.dir_rel_path,
							summary.total_files_recursive,
						]),
					),
				);
				setFolderFileCounts(nextCounts);
			})
			.catch(() => {
				if (!cancelled) {
					setFolderFileCounts({});
				}
			});

		return () => {
			cancelled = true;
		};
	}, [spacePath, showFolderFileCounts, summaryParentDirs]);

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

	const handleChangeAppearance = useCallback(
		async (entry: FsEntry, appearance: FileTreeAppearance) => {
			try {
				await setItemAppearance(entry.rel_path, appearance);
			} catch (error) {
				const message = extractErrorMessage(error);
				setError(message);
				toast.error("Could not update file tree appearance", {
					description: message,
				});
			}
		},
		[setError, setItemAppearance],
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
						onCreateFromTemplateInDir={onCreateFromTemplateInDir}
						onNewDatabaseInDir={onNewDatabaseInDir}
						onNewFolderInDir={handleCreateFolder}
						onDeletePath={handleDeletePath}
						onStartRename={setRenamingPath}
						onCommitDirRename={handleCommitDirRename}
						onCommitFileRename={handleCommitFileRename}
						onCancelRename={() => setRenamingPath(null)}
						itemAppearance={itemAppearance}
						folderFileCounts={folderFileCounts}
						showFolderFileCounts={showFolderFileCounts}
						onChangeAppearance={handleChangeAppearance}
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
