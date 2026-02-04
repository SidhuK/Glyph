import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import type { FsEntry, RecentEntry } from "../../lib/tauri";
import { FolderClosed, RefreshCw } from "../Icons";
import { FolderShelfItem, RecentShelfItem } from "./ShelfItem";

const spring = {
	type: "spring",
	stiffness: 520,
	damping: 34,
} as const;

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
								subfolders.map((f) => (
									<FolderShelfItem
										key={f.rel_path}
										folder={f}
										onOpenFolder={onOpenFolder}
									/>
								))
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
								recents.map((r) => (
									<RecentShelfItem
										key={r.rel_path}
										recent={r}
										onOpenMarkdown={onOpenMarkdown}
										onOpenNonMarkdown={onOpenNonMarkdown}
										onFocusNode={onFocusNode}
									/>
								))
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
