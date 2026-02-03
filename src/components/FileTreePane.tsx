import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import type { DirChildSummary, FsEntry } from "../lib/tauri";
import {
	Archive,
	Cpu,
	Database,
	File,
	FileCode,
	FileJson,
	FileSpreadsheet,
	FileText,
	Film,
	FolderClosed,
	FolderOpen,
	Globe,
	Hash,
	Image,
	Music,
	Palette,
	Plus,
} from "./Icons";
import { MotionIconButton } from "./MotionUI";

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
		const summaryMap = new Map(
			(summariesByParentDir[parentDirPath] ?? []).map(
				(s) => [s.dir_rel_path, s] as const,
			),
		);
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
						const summary = summaryMap.get(e.rel_path) ?? null;
						const totalFiles = summary?.total_files_recursive ?? 0;
						const countsLabel =
							summary && totalFiles > 0 ? String(totalFiles) : "";
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
									variants={rowVariants}
									whileHover="hover"
									whileTap="tap"
									animate={isExpanded ? "active" : "idle"}
									transition={springTransition}
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
									<span className="fileTreeName">{e.name}</span>
									{countsLabel ? (
										<span
											className="fileTreeCounts"
											title={`${countsLabel} files`}
										>
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
											{renderEntries(children, depth, e.rel_path)}
										</motion.div>
									)}
								</AnimatePresence>
							</motion.li>
						);
					}

					const isActive = e.rel_path === activeFilePath;
					const ext = e.rel_path.split(".").pop()?.toLowerCase() ?? "";

					// Determine icon and color based on file type
					let IconComponent = File;
					let iconColor = "var(--text-tertiary)";
					let kindLabel = "file";

					if (e.is_markdown) {
						IconComponent = FileText;
						iconColor = "var(--text-accent)";
						kindLabel = "markdown";
					} else if (
						["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)
					) {
						IconComponent = Image;
						iconColor = "var(--color-green-500)";
						kindLabel = "image";
					} else if (["mp4", "avi", "mov", "webm", "mkv"].includes(ext)) {
						IconComponent = Film;
						iconColor = "var(--color-purple-500)";
						kindLabel = "video";
					} else if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
						IconComponent = Music;
						iconColor = "var(--color-yellow-500)";
						kindLabel = "audio";
					} else if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
						IconComponent = Archive;
						iconColor = "var(--color-yellow-500)";
						kindLabel = "archive";
					} else if (
						["js", "jsx", "ts", "tsx", "vue", "svelte"].includes(ext)
					) {
						IconComponent = FileCode;
						iconColor = "var(--color-yellow-500)";
						kindLabel = "code";
					} else if (["json"].includes(ext)) {
						IconComponent = FileJson;
						iconColor = "var(--text-tertiary)";
						kindLabel = "json";
					} else if (["csv", "xlsx", "xls"].includes(ext)) {
						IconComponent = FileSpreadsheet;
						iconColor = "var(--color-green-500)";
						kindLabel = "spreadsheet";
					} else if (["html", "htm", "css", "scss", "less"].includes(ext)) {
						IconComponent = Globe;
						iconColor = "var(--color-yellow-500)";
						kindLabel = "web";
					} else if (["sql", "db", "sqlite"].includes(ext)) {
						IconComponent = Database;
						iconColor = "var(--text-accent)";
						kindLabel = "database";
					} else if (["exe", "bin", "app", "deb", "rpm"].includes(ext)) {
						IconComponent = Cpu;
						iconColor = "var(--color-purple-500)";
						kindLabel = "executable";
					} else if (["psd", "ai", "sketch", "fig"].includes(ext)) {
						IconComponent = Palette;
						iconColor = "var(--color-purple-500)";
						kindLabel = "design";
					} else if (["lock", "key", "pem", "crt", "p12"].includes(ext)) {
						IconComponent = Hash;
						iconColor = "var(--text-error)";
						kindLabel = "security";
					} else if (["md", "mdx", "markdown"].includes(ext)) {
						IconComponent = FileText;
						iconColor = "var(--text-accent)";
						kindLabel = "markdown";
					} else if (["txt", "log", "readme"].includes(ext)) {
						IconComponent = FileText;
						iconColor = "var(--text-secondary)";
						kindLabel = "text";
					} else if (["pdf"].includes(ext)) {
						IconComponent = FileText;
						iconColor = "var(--text-error)";
						kindLabel = "pdf";
					} else if (["doc", "docx", "rtf"].includes(ext)) {
						IconComponent = FileText;
						iconColor = "var(--color-blue-500)";
						kindLabel = "document";
					}
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
									style={{ color: iconColor }}
								>
									<IconComponent size={14} />
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
