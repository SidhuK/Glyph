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
			{level === "urgent" ? (
				<svg
					className="tasksPriorityUrgent"
					viewBox="0 0 14 14"
					aria-hidden="true"
					focusable="false"
				>
					<rect x="1" y="1" width="12" height="12" rx="3" />
					<path d="M7 3.9v3.7M7 10.1v.01" />
				</svg>
			) : level ? (
				<DatabasePriorityBars value={level} />
			) : null}
		</span>
	);
}
