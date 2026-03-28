import { m } from "motion/react";
import { memo } from "react";
import type { RecentFile } from "../lib/settings";
import { basename, getFileTypeInfo } from "./filetree/fileTypeUtils";
import { springPresets } from "./ui/animations";
import { Button } from "./ui/shadcn/button";

interface RecentFilesPaneProps {
	recentFiles: RecentFile[];
	activeFilePath: string | null;
	onOpenFile: (relPath: string) => void;
	onRefresh: () => void;
}

const springTransition = springPresets.bouncy;

function isMarkdownPath(path: string): boolean {
	return /\.(md|mdx|markdown)$/i.test(path);
}

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const RecentFilesPane = memo(function RecentFilesPane({
	recentFiles,
	activeFilePath,
	onOpenFile,
	onRefresh,
}: RecentFilesPaneProps) {
	return (
		<m.section
			className="tagsPane"
			data-sidebar-list="recent"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			<div className="tagsHeader">
				<div className="tagsHeaderTitle">RECENT</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onRefresh}
					aria-label="Refresh recent files"
					title="Refresh recent files"
				>
					<m.span whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }}>
						↻
					</m.span>
				</Button>
			</div>
			{recentFiles.length > 0 ? (
				<ul className="tagsList">
					{recentFiles.map((file) => {
						const fullName = basename(file.path);
						const name = fullName.replace(/\.(md|mdx|markdown)$/i, "");
						const isMd = isMarkdownPath(file.path);
						const { Icon } = getFileTypeInfo(file.path, isMd);
						const isActive = file.path === activeFilePath;

						return (
							<li key={file.path} className="tagsItem">
								<m.button
									type="button"
									className="tagsButton"
									data-explicit={isActive ? "true" : "false"}
									onClick={() => onOpenFile(file.path)}
									title={file.path}
									whileHover={{
										scale: 1.02,
										y: -1,
										backgroundColor: "var(--bg-hover)",
									}}
									whileTap={{ scale: 0.98 }}
									transition={springTransition}
								>
									<span className="tagsNameWrap">
										<Icon
											size={12}
											className="sidebarRecentFileIcon"
										/>
										<span className="tagsName">{name}</span>
									</span>
									<span className="tagsCount mono">
										{formatRelativeTime(file.openedAt)}
									</span>
								</m.button>
							</li>
						);
					})}
				</ul>
			) : (
				<div className="tagsEmpty">No recent files.</div>
			)}
		</m.section>
	);
});
