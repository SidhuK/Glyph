import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "../../contexts";
import {
	formatDisplayDate,
	parseDisplayDateInput,
} from "../../lib/dateDisplayFormat";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import type { InboxTask, TaskAction } from "../../lib/tauri";
import { HugeiconsIcon } from "../HugeiconsIcon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { TaskSchedule } from "./TaskSchedule";

export function TaskRow({
	task,
	today,
	busy,
	onUpdate,
	onOpen,
}: {
	task: InboxTask;
	today: string;
	busy: boolean;
	onUpdate: (task: InboxTask, action: TaskAction) => Promise<boolean>;
	onOpen: (task: InboxTask) => void;
}) {
	const { t } = useTranslation("shell");
	const dateFormat = useDateDisplayFormat();
	const [scheduleOpen, setScheduleOpen] = useState(false);
	const date = task.due ? parseDisplayDateInput(task.due) : null;
	const overdue = !task.checked && task.due !== null && task.due < today;
	const label =
		normalizeInlineMarkdown(task.text).replace(
			/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
			(_match, target: string, alias: string | undefined) => alias ?? target,
		) || t("tasks.untitled");
	const dateLabel = date
		? task.due === today
			? t("tasks.views.today")
			: formatDisplayDate(date, dateFormat)
		: t("tasks.addDate");
	return (
		<div className="taskRow" data-checked={task.checked}>
			<input
				type="checkbox"
				className="taskCheckbox"
				checked={task.checked}
				disabled={busy}
				aria-label={t(
					task.checked ? "tasks.reopenTask" : "tasks.completeTask",
					{ task: label },
				)}
				onChange={() => {
					void onUpdate(task, {
						kind: "check",
						start: task.start,
						checked: !task.checked,
					});
				}}
			/>
			<button
				type="button"
				className="taskSource"
				onClick={() => onOpen(task)}
				title={t("tasks.openSource", { path: task.note_path, line: task.line })}
			>
				<span className="taskText">{label}</span>
				<span className="taskContext">
					{task.note_title}
					{task.context ? ` · ${task.context}` : ""}
					<span className="taskFolder">
						{task.note_path.includes("/")
							? ` · ${task.note_path.slice(0, task.note_path.lastIndexOf("/"))}`
							: ""}
					</span>
				</span>
			</button>
			<Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="taskDate"
						data-overdue={overdue}
						data-unscheduled={!task.due}
						disabled={busy}
						aria-label={t("tasks.editSchedule", { task: label })}
					>
						<HugeiconsIcon icon={Calendar03Icon} size="var(--icon-sm)" />
						<span>
							{overdue
								? t("tasks.overdueDate", { date: dateLabel })
								: dateLabel}
						</span>
						{task.repeat ? (
							<span title={t(`tasks.repeats.${task.repeat}`)}>↻</span>
						) : null}
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="taskSchedulePopover">
					<TaskSchedule
						key={`${task.etag}:${task.start}`}
						task={task}
						busy={busy}
						onSave={async (action) => {
							const saved = await onUpdate(task, action);
							if (saved) setScheduleOpen(false);
							return saved;
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
