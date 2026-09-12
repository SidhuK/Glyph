import { addDays, format } from "date-fns";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InboxTask, TaskAction, TaskRepeat } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

const repeats: readonly TaskRepeat[] = [
	"daily",
	"weekdays",
	"weekly",
	"monthly",
];
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
	const [repeat, setRepeat] = useState<TaskRepeat | null>(task.repeat);
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
					repeat,
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
				required={repeat !== null}
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
							repeat,
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
							repeat,
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
							repeat: null,
						});
					}}
				>
					{t("tasks.noDate")}
				</Button>
			</div>
			<label htmlFor={`${id}-repeat`}>{t("tasks.repeat")}</label>
			<select
				id={`${id}-repeat`}
				className="taskSelect"
				value={repeat ?? "none"}
				disabled={busy || task.checked}
				onChange={(event) => {
					const next =
						repeats.find((value) => value === event.target.value) ?? null;
					setRepeat(next);
					if (next && !due) setDue(today);
				}}
			>
				<option value="none">{t("tasks.repeats.none")}</option>
				{repeats.map((value) => (
					<option key={value} value={value}>
						{t(`tasks.repeats.${value}`)}
					</option>
				))}
			</select>
			{repeat ? (
				<p className="taskScheduleHint">{t("tasks.repeatHint")}</p>
			) : null}
			<Button type="submit" size="sm" disabled={busy}>
				{t("tasks.save")}
			</Button>
		</form>
	);
}
