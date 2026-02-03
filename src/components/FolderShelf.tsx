import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo } from "react";
import type { DirChildSummary, FsEntry, RecentEntry } from "../lib/tauri";
import { File, FileText, FolderOpen, RefreshCw } from "./Icons";

const spring = {
	type: "spring",
	stiffness: 520,
	damping: 34,
} as const;

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
	subfolders: FsEntry[];
	summaries: DirChildSummary[];
	recents: RecentEntry[];
	onOpenFolder: (dir: string) => void;
	onOpenMarkdown: (relPath: string) => void;
	onOpenNonMarkdown: (relPath: string) => void;
	onFocusNode: (nodeId: string) => void;
}

export const FolderShelf = memo(function FolderShelf({
	subfolders,
	summaries,
	recents,
	onOpenFolder,
	onOpenMarkdown,
	onOpenNonMarkdown,
	onFocusNode,
}: FolderShelfProps) {
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
			<div className="folderShelfBar">
				<div className="folderShelfGroup">
					<div className="folderShelfGroupHead" aria-label="Subfolders">
						<span className="folderShelfGroupIcon" aria-hidden>
							<FolderOpen size={14} />
						</span>
						<span className="folderShelfGroupTitle">Folders</span>
					</div>
					<ul className="folderShelfStrip" aria-label="Subfolders">
						<AnimatePresence initial={false}>
							{subfolders.length ? (
								subfolders.map((f) => {
									const s = summaryByDir.get(f.rel_path) ?? null;
									const meta = s
										? `${s.total_markdown_recursive} md • ${s.total_files_recursive} files`
										: "";
									return (
										<li key={f.rel_path} className="folderShelfItem">
											<motion.button
												type="button"
												className="folderCard"
												onClick={() => onOpenFolder(f.rel_path)}
												whileHover={{ y: -1 }}
												whileTap={{ scale: 0.98 }}
												transition={spring}
												title={`${f.rel_path}${meta ? `\n${meta}` : ""}`}
											>
												<span className="folderCardIcon" aria-hidden>
													<FolderOpen size={16} />
												</span>
												<span className="folderCardText">
													<span className="folderCardName">{f.name}</span>
												</span>
											</motion.button>
										</li>
									);
								})
							) : (
								<motion.li
									key="empty"
									className="folderShelfEmpty"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.15 }}
								>
									No subfolders.
								</motion.li>
							)}
						</AnimatePresence>
					</ul>
				</div>

				<div className="folderShelfDivider" aria-hidden />

				<div className="folderShelfGroup">
					<div className="folderShelfGroupHead" aria-label="Recent files">
						<span className="folderShelfGroupIcon" aria-hidden>
							<RefreshCw size={14} />
						</span>
						<span className="folderShelfGroupTitle">Recent</span>
					</div>
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
												</span>
											</motion.button>
										</li>
									);
								})
							) : (
								<motion.li
									key="empty"
									className="folderShelfEmpty"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.15 }}
								>
									No recent files.
								</motion.li>
							)}
						</AnimatePresence>
					</ul>
				</div>
			</div>
		</motion.section>
	);
});
