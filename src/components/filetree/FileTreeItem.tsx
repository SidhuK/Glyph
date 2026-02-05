import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { memo } from "react";
import type { DirChildSummary, FsEntry } from "../../lib/tauri";
import { FolderClosed, FolderOpen } from "../Icons";
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

interface FileTreeDirItemProps {
	entry: FsEntry;
	depth: number;
	isExpanded: boolean;
	summary: DirChildSummary | null;
	children?: ReactNode;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
}

export const FileTreeDirItem = memo(function FileTreeDirItem({
	entry,
	depth,
	isExpanded,
	summary,
	children,
	onToggleDir,
	onSelectDir,
}: FileTreeDirItemProps) {
	const paddingLeft = 10 + depth * 10;
	const rowStyle = {
		paddingLeft,
		"--tree-line-x": `${depth * 10 + 6}px`,
		"--row-indent": `${paddingLeft}px`,
		"--row-line-opacity": depth === 0 ? 0 : 0.85,
	} as CSSProperties;

	const totalFiles = summary?.total_files_recursive ?? 0;
	const countsLabel = summary && totalFiles > 0 ? String(totalFiles) : "";

	return (
		<motion.li
			className="fileTreeItem"
			variants={{
				hidden: { opacity: 0, x: -8 },
				visible: { opacity: 1, x: 0 },
			}}
			transition={{ duration: 0.15 }}
		>
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
			>
				<motion.span
					className="fileTreeIcon"
					style={{
						color: isExpanded ? "var(--text-accent)" : "var(--text-tertiary)",
					}}
					animate={{ scale: isExpanded ? 1.1 : 1 }}
					transition={springTransition}
				>
					{isExpanded ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
				</motion.span>
				<span className="fileTreeName">{entry.name}</span>
				{countsLabel ? (
					<span className="fileTreeCounts" title={`${countsLabel} files`}>
						{countsLabel}
					</span>
				) : null}
			</motion.button>
			<AnimatePresence>
				{isExpanded && children && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={springTransition}
						style={{ overflow: "hidden" }}
					>
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.li>
	);
});

interface FileTreeFileItemProps {
	entry: FsEntry;
	depth: number;
	isActive: boolean;
	onOpenFile: (filePath: string) => void;
}

export const FileTreeFileItem = memo(function FileTreeFileItem({
	entry,
	depth,
	isActive,
	onOpenFile,
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

	return (
		<motion.li
			className={isActive ? "fileTreeItem active" : "fileTreeItem"}
			variants={{
				hidden: { opacity: 0, x: -8 },
				visible: { opacity: 1, x: 0 },
			}}
			transition={{ duration: 0.15 }}
		>
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
				<span className="fileTreeName">{basename(entry.rel_path)}</span>
			</motion.button>
		</motion.li>
	);
});
