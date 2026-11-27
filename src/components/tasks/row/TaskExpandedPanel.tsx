import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowUpRight01Icon, File01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { TaskRecord } from "@/lib/tauri";
import { TaskDateButton } from "../menus/TaskDateButton";
import { TaskPriorityButton } from "../menus/TaskPriorityButton";
import { TaskStatusButton } from "../menus/TaskStatusButton";
import { TaskTagButton } from "../menus/TaskTagButton";
import { notePathLabel } from "../model/taskTitle";
import { useTasks } from "../TasksContext";
import { TaskSubtasks } from "./TaskSubtasks";

function TaskBreadcrumb({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const crumbs = [notePathLabel(record.note_path), record.heading].filter(
		(crumb): crumb is string => Boolean(crumb),
	);
	return (
		<nav className="tasksBreadcrumb" aria-label={t("tasks.location")}>
			<HugeiconsIcon icon={File01Icon} size="var(--icon-xs)" aria-hidden="true" />
			{crumbs.map((crumb, index) => (
				<span key={`${index}:${crumb}`} className="tasksBreadcrumbPart">
					{index > 0 ? (
						<span className="tasksBreadcrumbSeparator" aria-hidden="true">
							›
						</span>
					) : null}
					<span className="tasksBreadcrumbLabel">{crumb}</span>
				</span>
			))}
		</nav>
	);
}

export function TaskExpandedPanel({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { openInNote } = useTasks();
	return (
		<div className="tasksExpandedPanel">
			<div className="tasksPropertyRow" role="group" aria-label={t("tasks.properties.label")}>
				<TaskStatusButton record={record} />
				<TaskDateButton record={record} />
				<TaskPriorityButton record={record} />
				<TaskTagButton record={record} />
			</div>
			{record.subtask_total > 0 ? <TaskSubtasks record={record} /> : null}
			<div className="tasksExpandedFooter">
				<TaskBreadcrumb record={record} />
				<button type="button" className="tasksOpenInNote" onClick={() => openInNote(record)}>
					<span>{t("tasks.openInNote")}</span>
					<HugeiconsIcon icon={ArrowUpRight01Icon} size="var(--icon-xs)" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
