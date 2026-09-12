import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { pathInWorkspace } from "../../hooks/useFolderWorkspace";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke } from "../../lib/tauri";
import { basename } from "../../utils/path";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";

export function SidebarPinnedItems({
	onOpenFile,
	onOpenDatabase,
	onShowAll,
}: {
	onOpenFile: (path: string) => void;
	onOpenDatabase: (id: string) => void;
	onShowAll: () => void;
}) {
	const { t } = useTranslation("shell");
	const { pinnedFiles, itemAppearance, activeFilePath, folderWorkspace } =
		useFileTreeContext();
	const [expanded, setExpanded] = useState(true);
	const collections = useQuery({
		queryKey: navigationQueryKeys.databaseSummaries(),
		queryFn: () => invoke("databases_list"),
	});
	const files = pinnedFiles.filter((path) =>
		pathInWorkspace(path, folderWorkspace.folder),
	);
	const databases = (collections.data ?? []).filter(
		(item) =>
			item.pinned &&
			(!folderWorkspace.folder ||
				(item.source.kind === "folder" &&
					pathInWorkspace(item.source.value, folderWorkspace.folder))),
	);
	const count = files.length + databases.length;
	return (
		<div className="sidebarPinnedItems" data-sidebar-key="pinned">
			<button
				type="button"
				className="sidebarQuickActionBtn sidebarNavBtn"
				aria-expanded={expanded}
				onClick={() => setExpanded(!expanded)}
			>
				<span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
				<span className="sidebarQuickActionLabel">{t("sidebar.pinned")}</span>
				<span className="sidebarQuickActionCount">{count || ""}</span>
			</button>
			{expanded ? (
				<div className="sidebarPinnedList">
					{files.slice(0, 8).map((path) => (
						<button
							key={path}
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							data-active={activeFilePath === path}
							title={path}
							onClick={() => onOpenFile(path)}
						>
							<DatabaseColumnIcon
								iconName={itemAppearance[path]?.icon ?? "note"}
								size="var(--icon-sm)"
							/>
							<span className="sidebarQuickActionLabel">
								{basename(path).replace(/\.md$/i, "")}
							</span>
						</button>
					))}
					{databases.slice(0, Math.max(0, 8 - files.length)).map((item) => (
						<button
							key={item.id}
							type="button"
							className="sidebarQuickActionBtn sidebarNavBtn"
							onClick={() => onOpenDatabase(item.id)}
						>
							<DatabaseColumnIcon
								iconName={item.icon ?? "folder"}
								size="var(--icon-sm)"
							/>
							<span className="sidebarQuickActionLabel">{item.name}</span>
						</button>
					))}
					{collections.isError ? (
						<p className="sidebarWorkspaceHint" role="alert">
							{t("sidebar.workspace.pinsFailed")}
						</p>
					) : null}
					{count === 0 ? (
						<p className="sidebarWorkspaceHint">
							{t("sidebar.workspace.noPins")}
						</p>
					) : null}
					{count > 0 ? (
						<button
							type="button"
							className="sidebarQuickActionBtn"
							onClick={onShowAll}
						>
							{t("sidebar.workspace.allPins", { count })}
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
