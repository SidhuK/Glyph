import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { CheckListIcon } from "@hugeicons/core-free-icons";
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import type { TaskScope } from "../../lib/tauri";
import { CanvasPaneAwait } from "../app/CanvasPaneAwait";
import { dispatchInternalAnchorClick } from "../editor/markdown/editorEvents";
import { requestHeadingNavigation, slugifyHeading } from "../editor/markdown/headingAnchor";
import { Button } from "../ui/shadcn/button";
import { TasksList } from "./TasksList";
import type { TaskScopeKind } from "./TasksScopeSelects";
import { TasksToolbar } from "./TasksToolbar";
import { useTasksView } from "./useTasksView";

interface TasksPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
}

function toTaskScope(kind: TaskScopeKind, folder: string, tag: string): TaskScope {
	if (kind === "folder" && folder) return { kind, folder_prefix: folder };
	if (kind === "tag" && tag) return { kind, tag };
	return { kind: "all" };
}

export const TasksPane = memo(function TasksPane({ onOpenFile }: TasksPaneProps) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
	const [search, setSearch] = useState("");
	const [scopeKind, setScopeKind] = useState<TaskScopeKind>("all");
	const [folder, setFolder] = useState("");
	const [tag, setTag] = useState("");
	const scope = toTaskScope(scopeKind, folder, tag);
	const needle = search.trim().toLowerCase();
	const view = useTasksView(spacePath, scope, needle);
	const { flushNow, clearTimer } = view.completion;
	// React 19 ref cleanup: stop the hold timer when the pane unmounts.
	const attachPane = useCallback(
		(node: HTMLElement | null) => {
			setPaneElement(node);
			return clearTimer;
		},
		[clearTimer],
	);
	const changeScope = (apply: () => void) => {
		flushNow();
		apply();
	};

	const openTask = (notePath: string, heading: string | null) => {
		if (!heading) {
			void onOpenFile(notePath);
			return;
		}
		const anchor = slugifyHeading(heading) || heading;
		// Covers an editor that mounts (or remounts) for this note.
		requestHeadingNavigation({ path: notePath, anchor });
		// Covers an editor already showing the note (e.g. in another split), which won't remount.
		void onOpenFile(notePath).then(() =>
			dispatchInternalAnchorClick({ anchor: `#${anchor}`, sourcePath: notePath }),
		);
	};
	const showAllNotes = () =>
		changeScope(() => {
			setScopeKind("all");
			setFolder("");
			setTag("");
		});

	if (view.query.isLoading) {
		return <CanvasPaneAwait variant="all-docs" />;
	}

	const empty = needle
		? {
				message: t("tasks.emptySearch"),
				action: t("tasks.clearSearch"),
				onAction: () => setSearch(""),
			}
		: scope.kind !== "all"
			? { message: t("tasks.emptyScope"), action: t("tasks.showAllNotes"), onAction: showAllNotes }
			: { message: t("tasks.empty"), action: null, onAction: null };

	return (
		<section ref={attachPane} className="activityTimelinePane tasksPane">
			<header className="activityTimelineHeader">
				<h1 className="activityTimelineTitle">
					<HugeiconsIcon icon={CheckListIcon} size="var(--icon-2xl)" />
					<span>{t("sidebar.tasks")}</span>
				</h1>
			</header>
			<TasksToolbar
				spacePath={spacePath}
				search={search}
				onSearchChange={setSearch}
				scopeKind={scopeKind}
				onScopeKindChange={(kind) => changeScope(() => setScopeKind(kind))}
				folder={folder}
				onFolderChange={(value) => changeScope(() => setFolder(value))}
				tag={tag}
				onTagChange={(value) => changeScope(() => setTag(value))}
				openTasks={view.openTasks}
				notes={view.notes}
				onCollapseAll={view.collapseAll}
				onExpandAll={view.expandAll}
			/>
			{view.query.error ? (
				<div className="databaseLoadingState tasksState">
					{t("tasks.loadError", { message: view.query.error.message })}
				</div>
			) : view.rows.length === 0 ? (
				<div className="databaseLoadingState tasksState">
					<p>{empty.message}</p>
					{empty.action ? (
						<Button type="button" variant="outline" size="sm" onClick={empty.onAction}>
							{empty.action}
						</Button>
					) : null}
				</div>
			) : (
				<TasksList
					rows={view.rows}
					fractionWidth={view.fractionWidth}
					paneElement={paneElement}
					context={{
						needle,
						folderPrefix: scope.kind === "folder" ? scope.folder_prefix : null,
						onComplete: view.completion.complete,
						onCancel: view.completion.cancel,
						onOpen: openTask,
						onToggleCollapsed: view.toggleCollapsed,
					}}
				/>
			)}
		</section>
	);
});
