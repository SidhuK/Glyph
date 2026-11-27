import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskDatePicker } from "@/components/taskDatePicker/TaskDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import type { TaskRecord } from "@/lib/tauri";
import { dueTone } from "../model/taskDates";
import { useDueLabel } from "../row/TaskDateChip";
import { useTasks } from "../TasksContext";

export function TaskDateButton({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { today, setFields } = useTasks();
	const dueLabel = useDueLabel();
	const [open, setOpen] = useState(false);
	const label = record.due ? dueLabel(record.due) : t("tasks.properties.due");
	const choose = (due: string | null) => {
		setOpen(false);
		if (due !== record.due) setFields(record, { due });
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						className="tasksPropertyButton"
						data-empty={record.due ? undefined : "true"}
						data-tone={record.due ? dueTone(record.due, today) : undefined}
						aria-label={t("tasks.properties.dueLabel", { value: label })}
					/>
				}
			>
				<HugeiconsIcon icon={Calendar03Icon} size="var(--icon-sm)" aria-hidden="true" />
				<span>{label}</span>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={6} className="tasksPopover">
				<TaskDatePicker
					value={record.due}
					onSelect={choose}
					onRemove={record.due ? () => choose(null) : undefined}
				/>
			</PopoverContent>
		</Popover>
	);
}
