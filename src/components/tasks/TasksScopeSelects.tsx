import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke, type TaskScope } from "../../lib/tauri";
import { formatTagLabel } from "../editor/noteProperties/utils";
import { Button } from "../ui/shadcn/button";

/** The folder list only changes on folder create/move/delete, so skip refetching on note saves. */
const FOLDER_LIST_STALE_TIME_MS = 60_000;

export type TaskScopeKind = TaskScope["kind"];

function isTaskScopeKind(value: string): value is TaskScopeKind {
	return value === "all" || value === "folder" || value === "tag";
}

export interface TasksScopeSelectsProps {
	spacePath: string | null;
	scopeKind: TaskScopeKind;
	onScopeKindChange: (kind: TaskScopeKind) => void;
	folder: string;
	onFolderChange: (folder: string) => void;
	tag: string;
	onTagChange: (tag: string) => void;
}

export function TasksScopeSelects({
	spacePath,
	scopeKind,
	onScopeKindChange,
	folder,
	onFolderChange,
	tag,
	onTagChange,
}: TasksScopeSelectsProps) {
	const { t } = useTranslation("shell");
	const { tags } = useFileTreeContext();
	const foldersQuery = useQuery({
		queryKey: [...navigationQueryKeys.all, "task-folders", spacePath],
		queryFn: () =>
			invoke("space_list_dir", { recursive: true, directories_only: true, limit: 5000 }),
		enabled: Boolean(spacePath) && scopeKind === "folder",
		staleTime: FOLDER_LIST_STALE_TIME_MS,
	});
	const folders = useMemo(
		() =>
			(foldersQuery.data ?? []).map((entry) => entry.rel_path).sort((a, b) => a.localeCompare(b)),
		[foldersQuery.data],
	);
	const tagNames = useMemo(
		() =>
			tags
				.map((entry) => entry.tag)
				.filter((name) => name !== "people" && !name.startsWith("people/")),
		[tags],
	);

	return (
		<>
			<select
				className="databaseNativeSelect tasksScopeSelect"
				aria-label={t("tasks.scope")}
				value={scopeKind}
				onChange={(event) => {
					const next = event.currentTarget.value;
					if (isTaskScopeKind(next)) onScopeKindChange(next);
				}}
			>
				<option value="all">{t("tasks.scopeAll")}</option>
				<option value="folder">{t("tasks.scopeFolder")}</option>
				<option value="tag">{t("tasks.scopeTag")}</option>
			</select>
			{scopeKind === "folder" && foldersQuery.isError ? (
				<span className="tasksScopeError" role="alert">
					{t("tasks.foldersLoadFailed", { message: foldersQuery.error.message })}
					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={() => void foldersQuery.refetch()}
					>
						{t("tasks.retry")}
					</Button>
				</span>
			) : scopeKind === "folder" ? (
				<select
					className="databaseNativeSelect tasksScopeSelect"
					aria-label={t("tasks.folder")}
					value={folder}
					onChange={(event) => onFolderChange(event.currentTarget.value)}
				>
					<option value="">{t("tasks.allFolders")}</option>
					{folders.map((path) => (
						<option key={path} value={path}>
							{path}
						</option>
					))}
				</select>
			) : null}
			{scopeKind === "tag" ? (
				<select
					className="databaseNativeSelect tasksScopeSelect"
					aria-label={t("tasks.tag")}
					value={tag}
					onChange={(event) => onTagChange(event.currentTarget.value)}
				>
					<option value="">{t("tasks.allTags")}</option>
					{tagNames.map((name) => (
						<option key={name} value={name}>
							{formatTagLabel(name)}
						</option>
					))}
				</select>
			) : null}
		</>
	);
}
