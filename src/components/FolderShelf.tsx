import { AnimatePresence, motion } from "motion/react";
import type { ReactElement } from "react";
import { memo } from "react";
import type { FsEntry, RecentEntry } from "../lib/tauri";
import {
	Archive,
	Cpu,
	Database,
	File,
	FileCode,
	FileCss,
	FileDoc,
	FileHtml,
	FileJson,
	FilePdf,
	FilePpt,
	FileSpreadsheet,
	FileText,
	FileTxt,
	FileXml,
	Film,
	FolderClosed,
	Hash,
	Image,
	Music,
	Palette,
	RefreshCw,
} from "./Icons";
import type { IconProps } from "./Icons";

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

function formatRelativeCompact(mtimeMs: number): string {
	if (!Number.isFinite(mtimeMs) || mtimeMs <= 0) return "";
	const deltaMs = Date.now() - mtimeMs;
	if (!Number.isFinite(deltaMs)) return "";
	const abs = Math.abs(deltaMs);

	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	const week = 7 * day;

	const fmt = (n: number, unit: string) => `${n}${unit}`;
	if (abs < minute) return "now";
	if (abs < hour) return fmt(Math.round(abs / minute), "m");
	if (abs < day) return fmt(Math.round(abs / hour), "h");
	if (abs < week) return fmt(Math.round(abs / day), "d");
	return "";
}

function iconForRecent(
	relPath: string,
	isMarkdown: boolean,
): { Icon: (p: IconProps) => ReactElement; color: string } {
	const ext = relPath.split(".").pop()?.toLowerCase() ?? "";
	if (isMarkdown) return { Icon: FileText, color: "var(--text-accent)" };
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext))
		return { Icon: Image, color: "var(--color-green-500)" };
	if (["mp4", "avi", "mov", "webm", "mkv"].includes(ext))
		return { Icon: Film, color: "var(--color-purple-500)" };
	if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext))
		return { Icon: Music, color: "var(--color-yellow-500)" };
	if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
		return { Icon: Archive, color: "var(--color-yellow-500)" };
	if (["js", "jsx", "ts", "tsx", "vue", "svelte"].includes(ext))
		return { Icon: FileCode, color: "var(--color-yellow-500)" };
	if (["json", "yaml", "yml", "toml", "ini", "env"].includes(ext))
		return { Icon: FileJson, color: "var(--text-tertiary)" };
	if (["csv", "xlsx", "xls"].includes(ext))
		return { Icon: FileSpreadsheet, color: "var(--color-green-500)" };
	if (["ppt", "pptx", "key"].includes(ext))
		return { Icon: FilePpt, color: "var(--color-purple-500)" };
	if (["html", "htm"].includes(ext))
		return { Icon: FileHtml, color: "var(--color-yellow-500)" };
	if (["css", "scss", "less"].includes(ext))
		return { Icon: FileCss, color: "var(--color-yellow-500)" };
	if (["xml"].includes(ext))
		return { Icon: FileXml, color: "var(--text-tertiary)" };
	if (["sql", "db", "sqlite"].includes(ext))
		return { Icon: Database, color: "var(--text-accent)" };
	if (["exe", "bin", "app", "deb", "rpm"].includes(ext))
		return { Icon: Cpu, color: "var(--color-purple-500)" };
	if (["psd", "ai", "sketch", "fig"].includes(ext))
		return { Icon: Palette, color: "var(--color-purple-500)" };
	if (["lock", "key", "pem", "crt", "p12"].includes(ext))
		return { Icon: Hash, color: "var(--text-error)" };
	if (["pdf"].includes(ext))
		return { Icon: FilePdf, color: "var(--text-error)" };
	if (["doc", "docx", "rtf"].includes(ext))
		return { Icon: FileDoc, color: "var(--color-blue-500)" };
	if (["txt", "log", "readme"].includes(ext))
		return { Icon: FileTxt, color: "var(--text-secondary)" };
	return { Icon: File, color: "var(--text-tertiary)" };
}

export interface FolderShelfProps {
	subfolders: FsEntry[];
	recents: RecentEntry[];
	onOpenFolder: (dir: string) => void;
	onOpenMarkdown: (relPath: string) => void;
	onOpenNonMarkdown: (relPath: string) => void;
	onFocusNode: (nodeId: string) => void;
}

export const FolderShelf = memo(function FolderShelf({
	subfolders,
	recents,
	onOpenFolder,
	onOpenMarkdown,
	onOpenNonMarkdown,
	onFocusNode,
}: FolderShelfProps) {
	return (
		<motion.section
			className="folderShelf"
			initial={{ y: -6 }}
			animate={{ y: 0 }}
			transition={spring}
		>
			<div className="folderShelfBar">
				<div className="folderShelfGroup">
					<div className="folderShelfGroupHead" aria-label="Subfolders">
						<span className="folderShelfGroupIcon" aria-hidden>
							<FolderClosed size={12} />
						</span>
						<span className="folderShelfGroupTitle">Folders</span>
					</div>
					<ul className="folderShelfStrip" aria-label="Subfolders">
						<AnimatePresence initial={false}>
							{subfolders.length ? (
								subfolders.map((f) => {
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
													<FolderClosed size={14} />
												</span>
												<span className="folderCardText">
													<span className="folderCardName">{f.name}</span>
												</span>
											</motion.button>
										</li>
									);
								})
							) : (
								<li key="empty" className="folderShelfEmpty">
									No subfolders.
								</li>
							)}
						</AnimatePresence>
					</ul>
				</div>

				<div className="folderShelfDivider" aria-hidden />

				<div className="folderShelfGroup">
					<div className="folderShelfGroupHead" aria-label="Recent files">
						<span className="folderShelfGroupIcon" aria-hidden>
							<RefreshCw size={12} />
						</span>
						<span className="folderShelfGroupTitle">Recent</span>
					</div>
					<ul className="folderShelfStrip" aria-label="Recent files">
						<AnimatePresence initial={false}>
							{recents.length ? (
								recents.map((r) => {
									const mtime = formatMtime(r.mtime_ms);
									const rel = formatRelativeCompact(r.mtime_ms);
									const { Icon, color } = iconForRecent(
										r.rel_path,
										r.is_markdown,
									);
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
													style={{ color }}
													aria-hidden
												>
													<Icon size={14} />
												</span>
												<span className="recentFileCardText">
													<span className="recentFileCardName">{r.name}</span>
												</span>
												{rel ? (
													<span className="recentFileCardMetaChip" aria-hidden>
														{rel}
													</span>
												) : null}
											</motion.button>
										</li>
									);
								})
							) : (
								<li key="empty" className="folderShelfEmpty">
									No recent files.
								</li>
							)}
						</AnimatePresence>
					</ul>
				</div>
			</div>
		</motion.section>
	);
});
