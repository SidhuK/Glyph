import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import {
	isMarkdownPath,
	parentDir,
	basename as relBasename,
} from "../../utils/path";
import { springPresets } from "../ui/animations";
import { FileTreeDirItem } from "./FileTreeDirItem";
import { FileTreeFileItem } from "./FileTreeFileItem";
import { rowVariants } from "./fileTreeItemHelpers";

interface FileTreePaneProps {
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	activeDirPath: string | null;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onPrefetchFile?: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	renamingPath: string | null;
	onStartRename: (path: string) => void;
	onCancelRename: () => void;
	onCommitFileRename: (path: string, nextName: string) => Promise<void>;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<void>;
	pinnedFiles: string[];
	onTogglePinnedFile: (path: string) => Promise<void>;
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
	onPrefetchFile?: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
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
	pinnedFiles: string[];
	onTogglePinnedFile: (path: string) => Promise<void>;
	onArrowNavigate: (
		path: string,
		direction: -1 | 1,
		currentTarget: HTMLButtonElement,
	) => void;
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
	onPrefetchFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onDeletePath,
	onStartRename,
	onCommitDirRename,
	onCommitFileRename,
	onCancelRename,
	itemAppearance,
	folderFileCounts,
	showFolderFileCounts,
	onChangeAppearance,
	pinnedFiles,
	onTogglePinnedFile,
	onArrowNavigate,
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
									onPrefetchFile={onPrefetchFile}
									onNewFileInDir={onNewFileInDir}
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onNewDatabaseInDir={onNewDatabaseInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDuplicateFile={onDuplicateFile}
									onDeletePath={onDeletePath}
									onStartRename={onStartRename}
									onCommitDirRename={onCommitDirRename}
									onCommitFileRename={onCommitFileRename}
									onCancelRename={onCancelRename}
									itemAppearance={itemAppearance}
									folderFileCounts={folderFileCounts}
									showFolderFileCounts={showFolderFileCounts}
									onChangeAppearance={onChangeAppearance}
									pinnedFiles={pinnedFiles}
									onTogglePinnedFile={onTogglePinnedFile}
									onArrowNavigate={onArrowNavigate}
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
						onPrefetchFile={onPrefetchFile}
						onNewFileInDir={onNewFileInDir}
						onCreateFromTemplateInDir={onCreateFromTemplateInDir}
						onNewDatabaseInDir={onNewDatabaseInDir}
						onNewFolderInDir={onNewFolderInDir}
						onDuplicateFile={onDuplicateFile}
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
						isPinned={pinnedFiles.includes(e.rel_path)}
						onTogglePinned={onTogglePinnedFile}
						onArrowNavigate={onArrowNavigate}
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
	onPrefetchFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onDeletePath,
	renamingPath,
	onStartRename,
	onCancelRename,
	onCommitFileRename,
	onCommitDirRename,
	pinnedFiles,
	onTogglePinnedFile,
}: FileTreePaneProps) {
	const { itemAppearance, setItemAppearance } = useFileTreeContext();
	const { spacePath, setError } = useSpace();
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

	const folderCountTreeRevision = useMemo(() => {
		const serializeEntries = (entries: FsEntry[] | undefined) =>
			(entries ?? [])
				.map((entry) => `${entry.kind}:${entry.rel_path}`)
				.join("|");

		return summaryParentDirs
			.map((dirPath) =>
				dirPath
					? `${dirPath}=>${serializeEntries(childrenByDir[dirPath])}`
					: `root=>${serializeEntries(rootEntries)}`,
			)
			.join("||");
	}, [childrenByDir, rootEntries, summaryParentDirs]);

	useEffect(() => {
		if (!spacePath || !showFolderFileCounts) {
			setFolderFileCounts({});
			return;
		}

		const requestRevision = folderCountTreeRevision;
		if (!requestRevision) {
			setFolderFileCounts({});
			return;
		}

		let cancelled = false;
		const summaryRequests: Array<Promise<DirChildSummary[]>> =
			summaryParentDirs.map((dirPath) =>
				invoke("space_dir_children_summary", dirPath ? { dir: dirPath } : {}),
			);

		void Promise.allSettled(summaryRequests).then((results) => {
			if (cancelled) return;
			const nextCounts: Record<string, number> = {};
			let hasSuccessfulResult = false;

			for (const result of results) {
				if (result.status !== "fulfilled") {
					console.warn(
						"Failed to load folder file counts for part of the tree",
						result.reason,
					);
					continue;
				}
				hasSuccessfulResult = true;
				for (const summary of result.value) {
					nextCounts[summary.dir_rel_path] = summary.total_files_recursive;
				}
			}

			if (!hasSuccessfulResult) return;
			setFolderFileCounts((prev) => ({
				...prev,
				...nextCounts,
			}));
		});

		return () => {
			cancelled = true;
		};
	}, [
		spacePath,
		showFolderFileCounts,
		summaryParentDirs,
		folderCountTreeRevision,
	]);

	const handleCreateFolder = useCallback(
		async (dirPath: string) => {
			const created = await onNewFolderInDir(dirPath);
			if (created) {
				onStartRename(created);
			}
			return created;
		},
		[onNewFolderInDir, onStartRename],
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

	const handleDuplicateFile = useCallback(
		async (path: string) => {
			const duplicatedPath = await onDuplicateFile(path);
			if (duplicatedPath) {
				onStartRename(duplicatedPath);
			}
			return duplicatedPath;
		},
		[onDuplicateFile, onStartRename],
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

	const pinnedFileItems = useMemo(
		() =>
			pinnedFiles.map((path) => {
				const fileName = relBasename(path);
				const displayName =
					fileName.replace(/\.[^./]+$/, "") || fileName || path;
				return {
					path,
					displayName,
					parent: parentDir(path),
					isMarkdown: isMarkdownPath(path),
				};
			}),
		[pinnedFiles],
	);

	const handleArrowNavigate = useCallback(
		(_path: string, direction: -1 | 1, currentTarget: HTMLButtonElement) => {
			const pane = currentTarget.closest(".fileTreePane");
			if (!pane) return;
			const fileButtons = Array.from(
				pane.querySelectorAll<HTMLButtonElement>(
					"[data-file-tree-file='true']",
				),
			);
			const currentIndex = fileButtons.findIndex(
				(button) => button === currentTarget,
			);
			if (currentIndex === -1) return;
			const nextButton = fileButtons[currentIndex + direction];
			if (!nextButton) return;
			nextButton.focus();
			nextButton.click();
		},
		[],
	);

	return (
		<m.aside
			className="fileTreePane"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			{rootEntries.length || pinnedFileItems.length ? (
				<div className="fileTreeScroll">
					{pinnedFileItems.length > 0 ? (
						<section className="fileTreePinnedSection">
							<ul className="fileTreeList fileTreePinnedList">
								{pinnedFileItems.map((file) => {
									const isActive = file.path === activeFilePath;
									return (
										<li
											key={file.path}
											className={
												isActive ? "fileTreeItem active" : "fileTreeItem"
											}
										>
											<div className="fileTreeRowShell">
												<m.button
													type="button"
													className="fileTreeRow fileTreePinnedRow"
													onClick={() => onOpenFile(file.path)}
													onKeyDown={(event) => {
														if (
															event.key !== "ArrowDown" &&
															event.key !== "ArrowUp"
														) {
															return;
														}
														event.preventDefault();
														event.stopPropagation();
														handleArrowNavigate(
															file.path,
															event.key === "ArrowDown" ? 1 : -1,
															event.currentTarget,
														);
													}}
													title={file.path}
													variants={rowVariants}
													whileHover="hover"
													whileTap="tap"
													animate={isActive ? "active" : "idle"}
													transition={springTransition}
													data-file-tree-file="true"
													data-file-tree-path={file.path}
												>
													<span
														role="button"
														tabIndex={-1}
														title="Unpin"
														onClick={(e) => {
															e.stopPropagation();
															onTogglePinnedFile(file.path);
														}}
														onKeyDown={(e) => {
															if (e.key === "Enter" || e.key === " ") {
																e.stopPropagation();
																onTogglePinnedFile(file.path);
															}
														}}
														className="fileTreePinToggle fileTreeIcon"
													>
														<HugeiconsIcon
															icon={PinIcon}
															size={14}
															strokeWidth={0.9}
															className="fileTreePinIcon"
															aria-hidden="true"
														/>
														<HugeiconsIcon
															icon={PinOffIcon}
															size={14}
															strokeWidth={0.9}
															className="fileTreePinOffIcon"
															aria-hidden="true"
														/>
													</span>
													<span className="fileTreeName">
														{file.displayName}
													</span>
													{file.parent ? (
														<span className="fileTreePinnedPath">
															{file.parent}
														</span>
													) : null}
												</m.button>
											</div>
										</li>
									);
								})}
							</ul>
						</section>
					) : null}
					{rootEntries.length ? (
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
							onPrefetchFile={onPrefetchFile}
							onNewFileInDir={onNewFileInDir}
							onCreateFromTemplateInDir={onCreateFromTemplateInDir}
							onNewDatabaseInDir={onNewDatabaseInDir}
							onNewFolderInDir={handleCreateFolder}
							onDuplicateFile={handleDuplicateFile}
							onDeletePath={handleDeletePath}
							onStartRename={onStartRename}
							onCommitDirRename={onCommitDirRename}
							onCommitFileRename={onCommitFileRename}
							onCancelRename={onCancelRename}
							itemAppearance={itemAppearance}
							folderFileCounts={folderFileCounts}
							showFolderFileCounts={showFolderFileCounts}
							onChangeAppearance={handleChangeAppearance}
							pinnedFiles={pinnedFiles}
							onTogglePinnedFile={onTogglePinnedFile}
							onArrowNavigate={handleArrowNavigate}
						/>
					) : null}
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
