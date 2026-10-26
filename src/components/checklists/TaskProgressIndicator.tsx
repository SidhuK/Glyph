import { useTranslation } from "react-i18next";
import type { NoteTaskSummary } from "../../lib/tauri";

interface TaskProgressIndicatorProps {
	summary: NoteTaskSummary;
	className?: string;
}

export function TaskProgressIndicator({ summary, className = "" }: TaskProgressIndicatorProps) {
	const { t } = useTranslation("shell");
	const { completed_count, total_count } = summary;
	const label = t("tasks.progress", { completed: completed_count, total: total_count });

	return (
		<span
			className={["markdownEditorTaskProgress", className].filter(Boolean).join(" ")}
			title={label}
			aria-label={label}
		>
			<span aria-hidden="true">
				{t("tasks.fraction", { completed: completed_count, total: total_count })}
			</span>
		</span>
	);
}
