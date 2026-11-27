import type { TaskStatusKind } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface TaskStatusGlyphProps {
	status: TaskStatusKind;
	className?: string;
}

export function TaskStatusGlyph({ status, className }: TaskStatusGlyphProps) {
	return (
		<svg
			className={cn("tasksStatusGlyph", className)}
			data-status={status}
			viewBox="0 0 16 16"
			aria-hidden="true"
			focusable="false"
		>
			{status === "todo" || status === "in_progress" ? (
				<circle className="tasksStatusGlyphRing" cx="8" cy="8" r="6.75" />
			) : (
				<circle className="tasksStatusGlyphDisc" cx="8" cy="8" r="7.5" />
			)}
			{status === "in_progress" ? (
				<path className="tasksStatusGlyphPie" d="M8 8V3.75a4.25 4.25 0 0 1 0 8.5z" />
			) : null}
			{status === "done" ? (
				<path className="tasksStatusGlyphMark" d="M4.9 8.2l2.1 2.1 4.1-4.4" />
			) : null}
			{status === "cancelled" ? (
				<path className="tasksStatusGlyphMark" d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" />
			) : null}
		</svg>
	);
}
