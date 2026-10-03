import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskSchedule } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

type Recurrence = Extract<TaskSchedule, { kind: "dated" }>["recurrence"];

type TaskScheduleFormProps = {
	schedule: TaskSchedule;
	disabled: boolean;
	onSave: (schedule: TaskSchedule) => void;
};

function localDateTime(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

export function TaskScheduleForm({ schedule, disabled, onSave }: TaskScheduleFormProps) {
	const { t } = useTranslation("shell");
	const [due, setDue] = useState(schedule.kind === "dated" ? schedule.due : "");
	const [recurrence, setRecurrence] = useState<Recurrence>(
		schedule.kind === "dated" ? schedule.recurrence : null,
	);
	const [reminder, setReminder] = useState(() => localDateTime(schedule.reminder));
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="flex flex-wrap items-end gap-3 pt-3"
			onSubmit={(event) => {
				event.preventDefault();
				setError(null);
				const reminderDate = reminder ? new Date(reminder) : null;
				if (
					reminderDate &&
					(!Number.isFinite(reminderDate.getTime()) ||
						localDateTime(reminderDate.toISOString()) !== reminder)
				) {
					setError(t("taskInbox.invalidReminder"));
					return;
				}
				const reminderAt = reminderDate?.toISOString() ?? null;
				if (due) {
					onSave({ kind: "dated", due, recurrence, reminder: reminderAt });
				} else if (recurrence === null) {
					onSave({ kind: "unscheduled", reminder: reminderAt });
				} else {
					setError(t("taskInbox.dueRequired"));
				}
			}}
		>
			<label className="flex flex-col gap-1 text-xs">
				{t("taskInbox.due")}
				<input
					type="date"
					className="rounded border p-2"
					value={due}
					min="0001-01-01"
					max="9999-12-31"
					required={recurrence !== null}
					onChange={(event) => setDue(event.target.value)}
					disabled={disabled}
				/>
			</label>
			<label className="flex flex-col gap-1 text-xs">
				{t("taskInbox.recurrence")}
				<select
					className="rounded border p-2"
					value={recurrence ?? ""}
					disabled={disabled}
					onChange={(event) => {
						const value = event.target.value;
						if (value === "daily" || value === "weekly" || value === "monthly") {
							setRecurrence(value);
						} else if (value === "") {
							setRecurrence(null);
						}
					}}
				>
					<option value="">{t("taskInbox.never")}</option>
					<option value="daily">{t("taskInbox.daily")}</option>
					<option value="weekly">{t("taskInbox.weekly")}</option>
					<option value="monthly">{t("taskInbox.monthly")}</option>
				</select>
			</label>
			<label className="flex flex-col gap-1 text-xs">
				{t("taskInbox.reminder")}
				<input
					type="datetime-local"
					className="rounded border p-2"
					value={reminder}
					min="0001-01-01T00:00"
					max="9999-12-31T23:59"
					onChange={(event) => setReminder(event.target.value)}
					disabled={disabled}
				/>
			</label>
			<Button type="submit" size="sm" disabled={disabled}>
				{t("taskInbox.save")}
			</Button>
			{error ? (
				<p className="w-full text-sm text-destructive" role="alert">
					{error}
				</p>
			) : null}
		</form>
	);
}
