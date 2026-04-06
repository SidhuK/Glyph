import type { NoteTaskSummary } from "../../lib/tauri";

interface TaskProgressIndicatorProps {
	summary: NoteTaskSummary;
	className?: string;
}

export function TaskProgressIndicator({
	summary,
	className = "",
}: TaskProgressIndicatorProps) {
	const { completed_count, total_count } = summary;
	const ratio = total_count > 0 ? completed_count / total_count : 0;
	const tone =
		ratio >= 1 ? "green" : ratio >= 0.66 ? "blue" : ratio >= 0.25 ? "yellow" : "red";

	return (
		<div
			className={["markdownEditorTaskProgress", className].filter(Boolean).join(" ")}
			title={`${completed_count}/${total_count} tasks completed`}
			aria-label={`${completed_count} of ${total_count} tasks completed`}
		>
			<div className={`markdownEditorTaskProgressBar is-${tone}`} aria-hidden="true">
				<div
					className="markdownEditorTaskProgressFill"
					style={{ transform: `scaleX(${ratio})` }}
				/>
			</div>
		</div>
	);
}
