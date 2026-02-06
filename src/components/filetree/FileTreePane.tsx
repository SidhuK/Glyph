import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { memo, useCallback, useState } from "react";
import type { DirChildSummary, FsEntry } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import { Plus } from "../Icons";
import { MotionIconButton } from "../MotionUI";
import { FileTreeDirItem, FileTreeFileItem } from "./FileTreeItem";

interface FileTreePaneProps {
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	summariesByParentDir: Record<string, DirChildSummary[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onNewFile: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
}

const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const FileTreePane = memo(function FileTreePane({
	rootEntries,
	childrenByDir,
	summariesByParentDir,
	expandedDirs,
	activeFilePath,
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
}: FileTreePaneProps) {
	const [renamingDirPath, setRenamingDirPath] = useState<string | null>(null);

	const handleCreateFolder = useCallback(
		async (dirPath: string) => {
			const created = await onNewFolderInDir(dirPath);
			if (created) {
				setRenamingDirPath(created);
			}
		},
		[onNewFolderInDir],
	);

	const handleCommitRename = useCallback(
		async (dirPath: string, nextName: string) => {
			const renamed = await onRenameDir(dirPath, nextName);
			if (renamed) {
				setRenamingDirPath(null);
			}
		},
		[onRenameDir],
	);

	const renderEntries = (
		entries: FsEntry[],
		parentDepth: number,
		parentDirPath: string,
	) => {
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
			<motion.ul
				className="fileTreeList"
				style={listStyle}
				initial="hidden"
				animate="visible"
				variants={{
					visible: { transition: { staggerChildren: 0.03 } },
					hidden: {},
				}}
			>
				{entries.map((e) => {
					const isDir = e.kind === "dir";
					const depth = parentDepth + 1;

					if (isDir) {
						const isExpanded = expandedDirs.has(e.rel_path);
						const children = childrenByDir[e.rel_path];
						const summary = summaryMap.get(e.rel_path) ?? null;

						return (
							<FileTreeDirItem
								key={e.rel_path}
								entry={e}
								depth={depth}
								isExpanded={isExpanded}
								isRenaming={renamingDirPath === e.rel_path}
								summary={summary}
								onToggleDir={onToggleDir}
								onSelectDir={onSelectDir}
								onNewFileInDir={onNewFileInDir}
								onNewFolderInDir={handleCreateFolder}
								onCommitRename={handleCommitRename}
								onCancelRename={() => setRenamingDirPath(null)}
							>
								{children && renderEntries(children, depth, e.rel_path)}
							</FileTreeDirItem>
						);
					}

					return (
						<FileTreeFileItem
							key={e.rel_path}
							entry={e}
							depth={depth}
							isActive={e.rel_path === activeFilePath}
							onOpenFile={onOpenFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={handleCreateFolder}
							parentDirPath={parentDir(e.rel_path)}
						/>
					);
				})}
			</motion.ul>
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
				<MotionIconButton
					type="button"
					onClick={onNewFile}
					title="New Markdown file"
				>
					<Plus size={16} />
				</MotionIconButton>
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
