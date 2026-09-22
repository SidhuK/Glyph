import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { displayFolderFromPath, displayNameFromPath, isMarkdownPath } from "../../utils/path";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";

interface RecentFilesPaneProps {
	spacePath: string | null;
	activeFilePath: string | null;
	onOpenFile: (path: string) => void;
}

interface SidebarFileListProps {
	paths: readonly string[];
	activeFilePath: string | null;
	onOpenFile: (path: string) => void;
}

const RECENT_FILE_LIMIT = 10;

function SidebarFileList({ paths, activeFilePath, onOpenFile }: SidebarFileListProps) {
	return (
		<div className="fileTreeScroll">
			<ul className="fileTreeList">
				{paths.map((path) => {
					const { Icon, color } = getFileTypeInfo(path, isMarkdownPath(path));
					const folder = displayFolderFromPath(path);
					return (
						<li
							key={path}
							className={path === activeFilePath ? "fileTreeItem active" : "fileTreeItem"}
						>
							<div className="fileTreeRowShell">
								<button
									type="button"
									className={folder ? "fileTreeRow fileTreePreviewRow" : "fileTreeRow"}
									onClick={() => onOpenFile(path)}
									title={path}
								>
									<Icon
										size="var(--icon-md)"
										className="fileTreeIcon"
										style={{ color }}
										aria-hidden="true"
									/>
									<span className="fileTreeFileText">
										<span className="fileTreeName">{displayNameFromPath(path)}</span>
										{folder ? <span className="fileTreeFilePreview">{folder}</span> : null}
									</span>
								</button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

export const PinnedFilesPane = memo(function PinnedFilesPane({
	pinnedFiles,
	activeFilePath,
	onOpenFile,
}: {
	pinnedFiles: readonly string[];
	activeFilePath: string | null;
	onOpenFile: (path: string) => void;
}) {
	const { t } = useTranslation("shell");

	if (pinnedFiles.length === 0) {
		return <div className="tagsEmpty">{t("sidebar.noPinnedFiles")}</div>;
	}

	return (
		<SidebarFileList paths={pinnedFiles} activeFilePath={activeFilePath} onOpenFile={onOpenFile} />
	);
});

export const RecentFilesPane = memo(function RecentFilesPane({
	spacePath,
	activeFilePath,
	onOpenFile,
}: RecentFilesPaneProps) {
	const { t } = useTranslation("shell");
	const { recentFiles } = useRecentFiles(spacePath, RECENT_FILE_LIMIT);

	if (!spacePath || recentFiles.length === 0) {
		return <div className="tagsEmpty">{t("sidebar.noRecentFiles")}</div>;
	}

	return (
		<SidebarFileList
			paths={recentFiles.map((file) => file.path)}
			activeFilePath={activeFilePath}
			onOpenFile={onOpenFile}
		/>
	);
});
