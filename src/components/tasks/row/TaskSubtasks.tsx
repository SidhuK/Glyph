import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSpace } from "@/contexts";
import type { TaskRecord } from "@/lib/tauri";
import { noteTasksQueryOptions } from "../data/taskQueries";
import { directChildrenOf } from "../model/taskIdentity";
import { circleToggleChar, isOpenStatus } from "@/lib/taskFields/taskStatus";
import { taskDisplayTitle } from "../model/taskTitle";
import { useTasks } from "../TasksContext";
import { TaskStatusGlyph } from "./TaskStatusGlyph";

export function TaskSubtasks({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { today, writeStatus } = useTasks();
	const query = useQuery(noteTasksQueryOptions(spacePath, [record.note_path], today));
	const children = query.data ? directChildrenOf(query.data, record) : [];
	if (query.error) {
		return (
			<p className="tasksSubtasksState">{t("tasks.loadError", { message: query.error.message })}</p>
		);
	}
	if (children.length === 0) return null;
	return (
		<ul className="tasksSubtasks" aria-label={t("tasks.subtasks")}>
			{children.map((child) => {
				const title = taskDisplayTitle(child) || t("tasks.untitled");
				return (
					<li key={child.start} className="tasksSubtask" data-status={child.status_kind}>
						<button
							type="button"
							className="tasksStatusButton"
							aria-label={t(isOpenStatus(child.status_kind) ? "tasks.markDone" : "tasks.reopen", {
								task: title,
							})}
							onClick={() => writeStatus(child, circleToggleChar(child))}
						>
							<TaskStatusGlyph status={child.status_kind} />
						</button>
						<span className="tasksSubtaskTitle">{title}</span>
						{child.subtask_total > 0 ? (
							<span className="tasksSubtaskChip">
								{child.subtask_done}/{child.subtask_total}
							</span>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
