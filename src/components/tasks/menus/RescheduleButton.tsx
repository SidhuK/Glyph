import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskDatePicker } from "@/components/taskDatePicker/TaskDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import type { TaskRecord } from "@/lib/tauri";
import { useTasks } from "../TasksContext";

export function RescheduleButton({ records }: { records: readonly TaskRecord[] }) {
	const { t } = useTranslation("shell");
	const { reschedule } = useTasks();
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						className="tasksSectionAction"
						aria-label={t("tasks.rescheduleLabel", { count: records.length })}
					/>
				}
			>
				{t("tasks.reschedule")}
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={6} className="tasksPopover">
				<TaskDatePicker
					value={null}
					onSelect={(due) => {
						setOpen(false);
						reschedule(records, due);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
