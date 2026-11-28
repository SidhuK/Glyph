import { useTranslation } from "react-i18next";
import { DatabasePriorityBars } from "@/components/status/DatabasePriorityBars";
import type { TaskPriority } from "@/lib/tauri";
import { priorityLabelKey, priorityLevel } from "../model/taskPriority";

interface TaskPriorityIconProps {
	priority: TaskPriority | null;
	labelled?: boolean;
}

export function TaskPriorityIcon({ priority, labelled = false }: TaskPriorityIconProps) {
	const { t } = useTranslation("shell");
	const level = priorityLevel(priority);
	const label = labelled && level ? t(priorityLabelKey(priority)) : undefined;
	return (
		<span
			className="tasksPriorityIcon"
			data-level={level ?? undefined}
			title={label}
			role={label ? "img" : undefined}
			aria-label={label}
		>
			{level ? <DatabasePriorityBars value={level} /> : null}
		</span>
	);
}
