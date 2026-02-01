import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import type { FsEntry } from "../lib/tauri";
import { ChevronDown, FileText, Plus } from "./Icons";
import { MotionIconButton } from "./MotionUI";

interface FileTreePaneProps {
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onNewFile: () => void;
}

function basename(relPath: string): string {
	if (!relPath) return "";
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const FileTreePane = memo(function FileTreePane({
	rootEntries,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFile,
}: FileTreePaneProps) {
	const renderEntries = (entries: FsEntry[], parentDepth: number) => {
		return (
			<motion.ul
				className="fileTreeList"
				initial="hidden"
				animate="visible"
				variants={{
					visible: { transition: { staggerChildren: 0.03 } },
					hidden: {},
				}}
			>
				{entries.map((e, index) => {
					const isDir = e.kind === "dir";
					const isExpanded = isDir && expandedDirs.has(e.rel_path);
					const depth = parentDepth + 1;
					const paddingLeft = 10 + depth * 10;

					if (isDir) {
						const children = childrenByDir[e.rel_path];
						return (
							<motion.li
								key={e.rel_path}
								className="fileTreeItem"
								variants={{
									hidden: { opacity: 0, x: -8 },
									visible: { opacity: 1, x: 0 },
								}}
								transition={{ ...springTransition, delay: index * 0.02 }}
							>
								<motion.button
									type="button"
									className="fileTreeRow"
									onClick={() => {
										onSelectDir(e.rel_path);
										onToggleDir(e.rel_path);
									}}
									style={{ paddingLeft }}
									whileHover={{ x: 2, backgroundColor: "var(--bg-hover)" }}
									whileTap={{ scale: 0.98 }}
									transition={springTransition}
								>
									<motion.span
										className="fileTreeChevron"
										animate={{ rotate: isExpanded ? 0 : -90 }}
										transition={springTransition}
									>
										<ChevronDown size={14} />
									</motion.span>
									<span className="fileTreeName">{e.name}</span>
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
											{renderEntries(children, depth)}
										</motion.div>
									)}
								</AnimatePresence>
							</motion.li>
						);
					}

					const isActive = e.rel_path === activeFilePath;
					const ext = e.rel_path.split(".").pop()?.toLowerCase() ?? "";
					const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(
						ext,
					);
					const isPdf = ext === "pdf";
					const kindLabel = e.is_markdown
						? "markdown"
						: isImage
							? "image"
							: isPdf
								? "pdf"
								: "file";
					return (
						<motion.li
							key={e.rel_path}
							className={isActive ? "fileTreeItem active" : "fileTreeItem"}
							variants={{
								hidden: { opacity: 0, x: -8 },
								visible: { opacity: 1, x: 0 },
							}}
							transition={{ ...springTransition, delay: index * 0.02 }}
						>
							<motion.button
								type="button"
								className="fileTreeRow"
								onClick={() => onOpenFile(e.rel_path)}
								style={{ paddingLeft }}
								title={`${e.rel_path} (${kindLabel})`}
								whileHover={{ x: 2, backgroundColor: "var(--bg-hover)" }}
								whileTap={{ scale: 0.98 }}
								animate={
									isActive
										? { backgroundColor: "var(--selection-bg-muted)" }
										: {}
								}
								transition={springTransition}
							>
								<motion.span
									className="fileTreeIcon"
									animate={isActive ? { scale: 1.1 } : { scale: 1 }}
									transition={springTransition}
								>
									<FileText size={14} />
								</motion.span>
								<span className="fileTreeName">{basename(e.rel_path)}</span>
							</motion.button>
						</motion.li>
					);
				})}
			</motion.ul>
		);
	};

	return (
		<motion.aside
			className="fileTreePane"
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={springTransition}
		>
			<div className="fileTreeHeader">
				<h2 className="fileTreeTitle">
					<FileText size={14} />
					Files
				</h2>
				<MotionIconButton
					type="button"
					onClick={onNewFile}
					title="New Markdown file"
				>
					<Plus size={16} />
				</MotionIconButton>
			</div>
			{rootEntries.length ? (
				<div className="fileTreeScroll">{renderEntries(rootEntries, -1)}</div>
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
