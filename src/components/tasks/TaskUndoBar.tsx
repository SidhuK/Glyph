import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { useTasks } from "./TasksContext";

export function TaskUndoBar() {
	const { t } = useTranslation("shell");
	const { undoNotice, dismissUndo } = useTasks();
	if (!undoNotice) return null;
	return (
		<div className="tasksUndoBar" role="status">
			<HugeiconsIcon
				icon={Tick02Icon}
				size="var(--icon-sm)"
				className="tasksUndoBarIcon"
				aria-hidden="true"
			/>
			<span className="tasksUndoBarLabel">
				{t(undoNotice.kind === "completed" ? "tasks.completedToast" : "tasks.statusChangedToast")}
			</span>
			<button
				type="button"
				className="tasksUndoBarAction"
				onClick={() => {
					dismissUndo();
					undoNotice.undo();
				}}
			>
				{t("tasks.undo")}
			</button>
		</div>
	);
}
