import { m } from "motion/react";
import { memo } from "react";
import type { FsEntry, RecentEntry } from "../../lib/tauri";
import { FolderClosed } from "../Icons";
import {
	formatMtime,
	formatRelativeCompact,
	iconForRecent,
} from "./shelfUtils";

const spring = {
	type: "spring",
	stiffness: 520,
	damping: 34,
} as const;

interface FolderShelfItemProps {
	folder: FsEntry;
	onOpenFolder: (dir: string) => void;
}

export const FolderShelfItem = memo(function FolderShelfItem({
	folder,
	onOpenFolder,
}: FolderShelfItemProps) {
	return (
		<li className="folderShelfItem">
			<m.button
				type="button"
				className="folderCard"
				onClick={() => onOpenFolder(folder.rel_path)}
				whileHover={{ y: -1 }}
				whileTap={{ scale: 0.98 }}
				transition={spring}
				title={folder.rel_path}
			>
				<span className="folderCardIcon" aria-hidden>
					<FolderClosed size={14} />
				</span>
				<span className="folderCardText">
					<span className="folderCardName">{folder.name}</span>
				</span>
			</m.button>
		</li>
	);
});

interface RecentShelfItemProps {
	recent: RecentEntry;
	onOpenMarkdown: (relPath: string) => void;
	onOpenNonMarkdown: (relPath: string) => void;
	onFocusNode: (nodeId: string) => void;
}

export const RecentShelfItem = memo(function RecentShelfItem({
	recent,
	onOpenMarkdown,
	onOpenNonMarkdown,
	onFocusNode,
}: RecentShelfItemProps) {
	const mtime = formatMtime(recent.mtime_ms);
	const rel = formatRelativeCompact(recent.mtime_ms);
	const { Icon, color } = iconForRecent(recent.rel_path, recent.is_markdown);

	const handleClick = () => {
		if (recent.is_markdown) {
			onOpenMarkdown(recent.rel_path);
			return;
		}
		onOpenNonMarkdown(recent.rel_path);
		onFocusNode(recent.rel_path);
	};

	return (
		<li className="folderShelfItem">
			<m.button
				type="button"
				className="recentFileCard"
				onClick={handleClick}
				whileHover={{ y: -1 }}
				whileTap={{ scale: 0.98 }}
				transition={spring}
				title={`${recent.rel_path}${mtime ? `\nModified: ${mtime}` : ""}`}
			>
				<span className="recentFileCardIcon" style={{ color }} aria-hidden>
					<Icon size={14} />
				</span>
				<span className="recentFileCardText">
					<span className="recentFileCardName">{recent.name}</span>
				</span>
				{rel ? (
					<span className="recentFileCardMetaChip" aria-hidden>
						{rel}
					</span>
				) : null}
			</m.button>
		</li>
	);
});
