import { useTranslation } from "react-i18next";
import { getProgressColor } from "../../lib/taskProgressColor";
import type { NoteTaskSummary } from "../../lib/tauri";
import type { CssVars } from "../../lib/utils";

interface TaskProgressIndicatorProps {
	summary: NoteTaskSummary;
	className?: string;
}

function buildPieGradient(completed: number, total: number, color: string): string {
	const empty = "transparent";
	if (total === 0 || completed <= 0) {
		return `conic-gradient(${empty} 0deg 360deg)`;
	}
	if (completed >= total) {
		return `conic-gradient(${color} 0deg 360deg)`;
	}
	const completedDeg = (completed / total) * 360;
	return `conic-gradient(${color} 0deg ${completedDeg}deg, ${empty} ${completedDeg}deg 360deg)`;
}

export function TaskProgressIndicator({ summary, className = "" }: TaskProgressIndicatorProps) {
	const { t } = useTranslation("shell");
	const { completed_count, total_count } = summary;
	const label = t("tasks.progress", { completed: completed_count, total: total_count });
	const ratio = total_count > 0 ? completed_count / total_count : 0;
	const color = getProgressColor(ratio);
	const progressStyle: CssVars<"--task-progress-color"> = { "--task-progress-color": color };

	return (
		<div
			className={["markdownEditorTaskProgress", className].filter(Boolean).join(" ")}
			title={label}
			aria-label={label}
			style={progressStyle}
		>
			<span className="markdownEditorTaskProgressRing" aria-hidden="true">
				<span
					className="markdownEditorTaskProgressPie"
					style={{
						background: buildPieGradient(completed_count, total_count, color),
					}}
				/>
			</span>
		</div>
	);
}
