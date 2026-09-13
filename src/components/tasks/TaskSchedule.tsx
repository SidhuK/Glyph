import {
	Calendar03Icon,
	Cancel01Icon,
	Sun01Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { addDays, format } from "date-fns";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InboxTask, TaskAction } from "../../lib/tauri";
import { HugeiconsIcon } from "../HugeiconsIcon";
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
			<Button
				type="submit"
				size="sm"
				disabled={busy}
				aria-label={t("tasks.save")}
				title={t("tasks.save")}
			>
				<HugeiconsIcon icon={Tick02Icon} size="var(--icon-sm)" />
			</Button>
			<div className="taskDateShortcuts">
				{[
					{ label: t("tasks.views.today"), due: today, icon: Sun01Icon },
					{
						label: t("tasks.tomorrow"),
						due: format(addDays(new Date(), 1), "yyyy-MM-dd"),
						icon: Calendar03Icon,
					},
					{ label: t("tasks.noDate"), due: null, icon: Cancel01Icon },
				].map((shortcut) => (
					<Button
						key={shortcut.label}
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => {
							void onSave({
								kind: "schedule",
								start: task.start,
								due: shortcut.due,
							});
						}}
					>
						<HugeiconsIcon icon={shortcut.icon} size="var(--icon-sm)" />
						{shortcut.label}
					</Button>
				))}
			</div>
		</form>
	);
}
