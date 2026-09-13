import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import {
	displayFolderFromPath,
	displayNameFromPath,
	isMarkdownPath,
} from "../../utils/path";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";

interface RecentFilesPaneProps {
	spacePath: string | null;
	activeFilePath: string | null;
	onOpenFile: (path: string) => void;
}

const RECENT_FILE_LIMIT = 10;

export const RecentFilesPane = memo(function RecentFilesPane({
	spacePath,
	activeFilePath,
	onOpenFile,
}: RecentFilesPaneProps) {
	const { t } = useTranslation("shell");
	const { recentFiles } = useRecentFiles(spacePath, RECENT_FILE_LIMIT);

	if (recentFiles.length === 0) {
		return <div className="tagsEmpty">{t("sidebar.noRecentFiles")}</div>;
	}

	return (
		<div className="fileTreeScroll">
			<ul className="fileTreeList">
				{recentFiles.map((file) => {
					const { Icon, color } = getFileTypeInfo(
						file.path,
						isMarkdownPath(file.path),
					);
					const folder = displayFolderFromPath(file.path);
					return (
						<li
							key={file.path}
							className={
								file.path === activeFilePath
									? "fileTreeItem active"
									: "fileTreeItem"
							}
						>
							<div className="fileTreeRowShell">
								<button
									type="button"
									className={
										folder ? "fileTreeRow fileTreePreviewRow" : "fileTreeRow"
									}
									onClick={() => onOpenFile(file.path)}
									title={file.path}
								>
									<Icon
										size="var(--icon-md)"
										className="fileTreeIcon"
										style={{ color }}
										aria-hidden="true"
									/>
									<span className="fileTreeFileText">
										<span className="fileTreeName">
											{displayNameFromPath(file.path)}
										</span>
										{folder ? (
											<span className="fileTreeFilePreview">{folder}</span>
										) : null}
									</span>
								</button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
});
