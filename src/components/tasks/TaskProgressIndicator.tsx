import type { NoteTaskSummary } from "../../lib/tauri";

interface TaskProgressIndicatorProps {
	summary: NoteTaskSummary;
	className?: string;
}

const RING_RADIUS = 4;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function TaskProgressIndicator({
	summary,
	className = "",
}: TaskProgressIndicatorProps) {
	const { completed_count, total_count } = summary;
	const ratio = total_count > 0 ? completed_count / total_count : 0;
	const clampedRatio = Math.max(0, Math.min(1, ratio));

	return (
		<div
			className={["markdownEditorTaskProgress", className]
				.filter(Boolean)
				.join(" ")}
			title={`${completed_count}/${total_count} tasks completed`}
			aria-label={`${completed_count} of ${total_count} tasks completed`}
		>
			<svg
				className="markdownEditorTaskProgressRing"
				viewBox="0 0 12 12"
				aria-hidden="true"
			>
				<circle
					className="markdownEditorTaskProgressTrack"
					cx="6"
					cy="6"
					r={RING_RADIUS}
				/>
				<circle
					className="markdownEditorTaskProgressStroke"
					cx="6"
					cy="6"
					r={RING_RADIUS}
					strokeDasharray={RING_CIRCUMFERENCE}
					strokeDashoffset={RING_CIRCUMFERENCE * (1 - clampedRatio)}
				/>
			</svg>
		</div>
	);
}
