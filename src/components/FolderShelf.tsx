import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo } from "react";
import type { DirChildSummary, FsEntry, RecentEntry } from "../lib/tauri";
import { File, FileText, FolderOpen } from "./Icons";

const spring = {
	type: "spring",
	stiffness: 520,
	damping: 34,
} as const;

function joinPrefix(parts: string[], idxInclusive: number): string {
	return parts.slice(0, idxInclusive + 1).join("/");
}

function formatMtime(mtimeMs: number): string {
	if (!Number.isFinite(mtimeMs) || mtimeMs <= 0) return "";
	try {
		return new Date(mtimeMs).toLocaleString(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "";
	}
}

export interface FolderShelfProps {
	dir: string;
	subfolders: FsEntry[];
	summaries: DirChildSummary[];
	recents: RecentEntry[];
	onOpenFolder: (dir: string) => void;
	onOpenMarkdown: (relPath: string) => void;
	onOpenNonMarkdown: (relPath: string) => void;
	onFocusNode: (nodeId: string) => void;
}

export const FolderShelf = memo(function FolderShelf({
	dir,
	subfolders,
	summaries,
	recents,
	onOpenFolder,
	onOpenMarkdown,
	onOpenNonMarkdown,
	onFocusNode,
}: FolderShelfProps) {
	const crumbs = useMemo(() => {
		const parts = dir.split("/").filter(Boolean);
		return [{ label: "Vault", dir: "" }].concat(
			parts.map((p, idx) => ({ label: p, dir: joinPrefix(parts, idx) })),
		);
	}, [dir]);

	const summaryByDir = useMemo(() => {
		return new Map(summaries.map((s) => [s.dir_rel_path, s] as const));
	}, [summaries]);

	return (
		<motion.section
			className="folderShelf"
			initial={{ opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={spring}
		>
			<div className="folderShelfBreadcrumb">
				{crumbs.map((c, idx) => {
					const isLast = idx === crumbs.length - 1;
					return (
						<div key={c.dir || "root"} className="folderShelfCrumb">
							<button
								type="button"
								className={isLast ? "crumbBtn active" : "crumbBtn"}
								onClick={() => onOpenFolder(c.dir)}
								title={c.dir || "Vault"}
							>
								{c.label}
							</button>
							{!isLast ? <span className="crumbSep">/</span> : null}
						</div>
					);
				})}
			</div>

			<div className="folderShelfRow">
				<div className="folderShelfLabel">Subfolders</div>
				<ul className="folderShelfStrip" aria-label="Subfolders">
					<AnimatePresence initial={false}>
						{subfolders.length ? (
							subfolders.map((f) => {
								const s = summaryByDir.get(f.rel_path) ?? null;
								return (
									<li key={f.rel_path} className="folderShelfItem">
										<motion.button
											type="button"
											className="folderCard"
											onClick={() => onOpenFolder(f.rel_path)}
											whileHover={{ y: -1 }}
											whileTap={{ scale: 0.98 }}
											transition={spring}
											title={f.rel_path}
										>
											<span className="folderCardIcon" aria-hidden>
												<FolderOpen size={16} />
											</span>
											<span className="folderCardText">
												<span className="folderCardName">{f.name}</span>
												<span className="folderCardMeta">
													{s
														? `${s.total_markdown_recursive} md • ${s.total_files_recursive} files`
														: " "}
												</span>
											</span>
										</motion.button>
									</li>
								);
							})
						) : (
							<motion.div
								key="empty"
								className="folderShelfEmpty"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.15 }}
							>
								No subfolders.
							</motion.div>
						)}
					</AnimatePresence>
				</ul>
			</div>

			<div className="folderShelfRow">
				<div className="folderShelfLabel">Recent files</div>
				<ul className="folderShelfStrip" aria-label="Recent files">
					<AnimatePresence initial={false}>
						{recents.length ? (
							recents.map((r) => {
								const mtime = formatMtime(r.mtime_ms);
								const Icon = r.is_markdown ? FileText : File;
								const iconColor = r.is_markdown
									? "var(--text-accent)"
									: "var(--text-tertiary)";
								return (
									<li key={r.rel_path} className="folderShelfItem">
										<motion.button
											type="button"
											className="recentFileCard"
											onClick={() => {
												if (r.is_markdown) {
													onOpenMarkdown(r.rel_path);
													return;
												}
												onOpenNonMarkdown(r.rel_path);
												onFocusNode(r.rel_path);
											}}
											whileHover={{ y: -1 }}
											whileTap={{ scale: 0.98 }}
											transition={spring}
											title={`${r.rel_path}${mtime ? `\nModified: ${mtime}` : ""}`}
										>
											<span
												className="recentFileCardIcon"
												style={{ color: iconColor }}
												aria-hidden
											>
												<Icon size={16} />
											</span>
											<span className="recentFileCardText">
												<span className="recentFileCardName">{r.name}</span>
												<span className="recentFileCardMeta">
													{mtime || " "}
												</span>
											</span>
										</motion.button>
									</li>
								);
							})
						) : (
							<motion.div
								key="empty"
								className="folderShelfEmpty"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.15 }}
							>
								No recent files.
							</motion.div>
						)}
					</AnimatePresence>
				</ul>
			</div>
		</motion.section>
	);
});
