import { useTranslation } from "react-i18next";
import { getProgressColor } from "../../lib/taskProgressColor";
import type { CssVars } from "../../lib/utils";

/** The note header's progress bar and done/total fraction. */
export function TaskNoteProgress({ total, open }: { total: number; open: number }) {
	const { t } = useTranslation("shell");
	const done = total - open;
	const ratio = total > 0 ? done / total : 0;
	const fillStyle: CssVars<"--tasks-progress" | "--tasks-progress-color"> = {
		"--tasks-progress": ratio,
		"--tasks-progress-color": getProgressColor(ratio),
	};
	return (
		<div
			className="tasksProgress"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={done}
			aria-valuetext={t("tasks.progress", { completed: done, total })}
			data-complete={total > 0 && done === total ? "true" : undefined}
		>
			<span className="tasksProgressTrack" aria-hidden="true">
				<span className="tasksProgressFill" style={fillStyle} />
			</span>
			<span className="tasksProgressLabel" aria-hidden="true">
				{t("tasks.fraction", { completed: done, total })}
			</span>
		</div>
	);
}
