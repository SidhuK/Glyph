import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke, type TaskScope } from "../../lib/tauri";
import { formatTagLabel } from "../editor/noteProperties/utils";
import { Button } from "../ui/shadcn/button";
import { Select } from "../ui/shadcn/select";

/** The folder list only changes on folder create/move/delete, so skip refetching on note saves. */
const FOLDER_LIST_STALE_TIME_MS = 60_000;

export type TaskScopeKind = TaskScope["kind"];

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
			<Select
				className="tasksScopeSelect"
				aria-label={t("tasks.scope")}
				value={scopeKind}
				options={[
					{ value: "all", label: t("tasks.scopeAll") },
					{ value: "folder", label: t("tasks.scopeFolder") },
					{ value: "tag", label: t("tasks.scopeTag") },
				]}
				onValueChange={onScopeKindChange}
			/>
			{scopeKind === "folder" && foldersQuery.isError && !foldersQuery.data ? (
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
				<Select
					className="tasksScopeSelect"
					aria-label={t("tasks.folder")}
					value={folder}
					options={[
						{ value: "", label: t("tasks.allFolders") },
						...folders.map((path) => ({ value: path, label: path })),
					]}
					onValueChange={onFolderChange}
				/>
			) : null}
			{scopeKind === "tag" ? (
				<Select
					className="tasksScopeSelect"
					aria-label={t("tasks.tag")}
					value={tag}
					options={[
						{ value: "", label: t("tasks.allTags") },
						...tagNames.map((name) => ({ value: name, label: formatTagLabel(name) })),
					]}
					onValueChange={onTagChange}
				/>
			) : null}
		</>
	);
}
