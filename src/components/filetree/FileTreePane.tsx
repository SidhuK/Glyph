import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { memo } from "react";
import type { DirChildSummary, FsEntry } from "../../lib/tauri";
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
}: FileTreePaneProps) {
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
				{entries.map((e, index) => {
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
								index={index}
								isExpanded={isExpanded}
								summary={summary}
								onToggleDir={onToggleDir}
								onSelectDir={onSelectDir}
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
							index={index}
							isActive={e.rel_path === activeFilePath}
							onOpenFile={onOpenFile}
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
