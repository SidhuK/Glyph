import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { pathInWorkspace } from "../../hooks/useFolderWorkspace";
import { basename, parentDir } from "../../utils/path";

export function SidebarWorkspaceHeader({
	spaceLabel,
	onNavigate,
}: { spaceLabel: string; onNavigate: (folder: string | null) => void }) {
	const { t } = useTranslation("shell");
	const { folderWorkspace, activeFilePath } = useFileTreeContext();
	const folder = folderWorkspace.folder;
	if (!folder) return null;
	return (
		<div className="sidebarWorkspaceHeader">
			<nav
				aria-label={t("sidebar.workspace.location")}
				className="sidebarWorkspacePath"
			>
				<button
					type="button"
					onClick={() => onNavigate(parentDir(folder) || null)}
					title={t("sidebar.workspace.back")}
					aria-label={t("sidebar.workspace.back")}
				>
					←
				</button>
				<button
					type="button"
					onClick={() => onNavigate(null)}
					title={spaceLabel}
				>
					{spaceLabel}
				</button>
				{folder.split("/").map((part, index, parts) => (
					<span key={parts.slice(0, index + 1).join("/")}>
						<span aria-hidden="true"> / </span>
						<button
							type="button"
							aria-current={index === parts.length - 1 ? "location" : undefined}
							onClick={() => onNavigate(parts.slice(0, index + 1).join("/"))}
						>
							{part}
						</button>
					</span>
				))}
			</nav>
			{activeFilePath && !pathInWorkspace(activeFilePath, folder) ? (
				<p className="sidebarWorkspaceHint">
					{t("sidebar.workspace.outside", { note: basename(activeFilePath) })}
				</p>
			) : null}
		</div>
	);
}
