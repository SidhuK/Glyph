import { useTranslation } from "react-i18next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import type { TaskRecord } from "@/lib/tauri";
import { PRIORITY_MENU_VALUES, priorityLabelKey, priorityLevel } from "../model/taskPriority";
import { TaskPriorityIcon } from "../row/TaskPriorityIcon";
import { useTasks } from "../TasksContext";

export function TaskPriorityButton({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { setFields } = useTasks();
	const currentLevel = priorityLevel(record.priority);
	const label = currentLevel
		? t(priorityLabelKey(record.priority))
		: t("tasks.properties.priority");
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="tasksPropertyButton"
						data-empty={currentLevel ? undefined : "true"}
						aria-label={t("tasks.properties.priorityLabel", {
							value: t(priorityLabelKey(record.priority)),
						})}
					/>
				}
			>
				<TaskPriorityIcon priority={record.priority} />
				<span>{label}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={6}>
				{PRIORITY_MENU_VALUES.map((value) => (
					<DropdownMenuItem
						key={value ?? "none"}
						onClick={() => {
							if (priorityLevel(value) !== currentLevel) setFields(record, { priority: value });
						}}
					>
						<TaskPriorityIcon priority={value} />
						<span className="glyphMenuItemLabel">{t(priorityLabelKey(value))}</span>
						{priorityLevel(value) === currentLevel ? <DropdownMenuItemCheck /> : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
