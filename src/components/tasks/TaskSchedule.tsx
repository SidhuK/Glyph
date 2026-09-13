import { addDays, format } from "date-fns";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InboxTask, TaskAction } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

export function TaskSchedule({
	task,
	busy,
	onSave,
}: {
	task: InboxTask;
	busy: boolean;
	onSave: (action: TaskAction) => Promise<boolean>;
}) {
	const { t } = useTranslation("shell");
	const id = useId();
	const [due, setDue] = useState(task.due ?? "");
	const today = format(new Date(), "yyyy-MM-dd");
	return (
		<form
			className="taskSchedule"
			onSubmit={(event) => {
				event.preventDefault();
				void onSave({
					kind: "schedule",
					start: task.start,
					due: due || null,
				});
			}}
		>
			<label htmlFor={`${id}-due`}>{t("tasks.dueDate")}</label>
			<input
				className="taskNativeDate"
				id={`${id}-due`}
				type="date"
				value={due}
				min="0001-01-01"
				max="9999-12-31"
				disabled={busy}
				onChange={(event) => setDue(event.target.value)}
			/>
			<div className="taskDateShortcuts">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => {
						void onSave({
							kind: "schedule",
							start: task.start,
							due: today,
						});
					}}
				>
					{t("tasks.views.today")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => {
						void onSave({
							kind: "schedule",
							start: task.start,
							due: format(addDays(new Date(), 1), "yyyy-MM-dd"),
						});
					}}
				>
					{t("tasks.tomorrow")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => {
						void onSave({
							kind: "schedule",
							start: task.start,
							due: null,
						});
					}}
				>
					{t("tasks.noDate")}
				</Button>
			</div>
			<Button type="submit" size="sm" disabled={busy}>
				{t("tasks.save")}
			</Button>
		</form>
	);
}
