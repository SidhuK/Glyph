import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { InboxTask } from "../../lib/tauri";
import type { useTaskInbox } from "./useTaskInbox";

type TaskInboxRowProps = {
	task: InboxTask;
	now: number;
	today: string;
	disabled: boolean;
	onUpdate: ReturnType<typeof useTaskInbox>["update"]["mutate"];
	onEdit: (task: InboxTask) => void;
	onOpenNote: (path: string) => void;
};

export const TaskInboxRow = memo(function TaskInboxRow({
	task,
	now,
	today,
	disabled,
	onUpdate,
	onEdit,
	onOpenNote,
}: TaskInboxRowProps) {
	const { t, i18n } = useTranslation("shell");
	const reminderDue =
		!task.checked && task.schedule.reminder !== null && Date.parse(task.schedule.reminder) <= now;
	return (
		<div className="flex items-start gap-3">
			<input
				type="checkbox"
				className="mt-1"
				checked={task.checked}
				disabled={disabled}
				aria-label={t(task.checked ? "taskInbox.reopen" : "taskInbox.complete", {
					task: task.text,
				})}
				onChange={(event) =>
					onUpdate({ task, edit: { kind: "complete", checked: event.target.checked } })
				}
			/>
			<div className="min-w-0 flex-1">
				<p
					className={
						task.checked ? "break-words line-through text-muted-foreground" : "break-words"
					}
				>
					{task.text || t("taskInbox.untitled")}
				</p>
				<button
					type="button"
					className="text-xs text-muted-foreground underline"
					onClick={() => onOpenNote(task.note_path)}
				>
					{t("taskInbox.source", { path: task.note_path, line: task.line })}
				</button>
				<div className="flex flex-wrap gap-2 text-xs">
					{task.schedule.kind === "dated" ? (
						<>
							<span
								className={!task.checked && task.schedule.due < today ? "text-destructive" : ""}
							>
								{t("taskInbox.dueOn", { date: task.schedule.due })}
							</span>
							{task.schedule.recurrence ? (
								<span>{t(`taskInbox.${task.schedule.recurrence}`)}</span>
							) : null}
						</>
					) : null}
					{reminderDue ? (
						<span className="font-semibold text-destructive">{t("taskInbox.reminderDue")}</span>
					) : task.schedule.reminder ? (
						<span>
							{t("taskInbox.reminderOn", {
								date: new Date(task.schedule.reminder).toLocaleString(i18n.language),
							})}
						</span>
					) : null}
				</div>
				<button
					type="button"
					className="pt-2 text-xs underline"
					disabled={disabled}
					onClick={() => onEdit(task)}
				>
					{t("taskInbox.schedule")}
				</button>
			</div>
		</div>
	);
});
