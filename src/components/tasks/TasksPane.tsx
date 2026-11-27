import { memo, useCallback, useState } from "react";
import type { TaskView } from "@/lib/tauri";
import { TasksHeader } from "./header/TasksHeader";
import { TaskUndoBar } from "./TaskUndoBar";
import { fullDisplayDate } from "./model/taskDates";
import { TODAY_ADD_ROW_ID } from "./model/todayRows";
import { QuickAdd } from "./quickAdd/QuickAdd";
import { TasksContext } from "./TasksContext";
import { useTasksController } from "./useTasksController";
import { AllView } from "./views/AllView";
import { DoneView } from "./views/DoneView";
import { TodayView } from "./views/TodayView";
import { UpcomingView } from "./views/UpcomingView";

const NEW_TASK_ANCHOR = "new-task";

interface TasksPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
}

function TaskViewContent({
	view,
	paneElement,
	onViewChange,
}: {
	view: TaskView;
	paneElement: HTMLElement | null;
	onViewChange: (view: TaskView) => void;
}) {
	switch (view) {
		case "today":
			return <TodayView paneElement={paneElement} onSeeAll={() => onViewChange("all")} />;
		case "upcoming":
			return <UpcomingView paneElement={paneElement} />;
		case "all":
			return <AllView paneElement={paneElement} />;
		case "done":
			return <DoneView paneElement={paneElement} />;
	}
}

export const TasksPane = memo(function TasksPane({ onOpenFile }: TasksPaneProps) {
	const { value, clearTimers, flushHolds } = useTasksController(onOpenFile);
	const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
	const [view, setView] = useState<TaskView>("today");
	const attachPane = useCallback(
		(node: HTMLElement | null) => {
			setPaneElement(node);
			return clearTimers;
		},
		[clearTimers],
	);

	const changeView = (next: TaskView) => {
		flushHolds();
		value.collapse();
		value.closeQuickAdd();
		setView(next);
	};

	const openNewTask = () => {
		paneElement?.scrollTo({ top: 0 });
		value.openQuickAdd(
			view === "today"
				? { anchor: TODAY_ADD_ROW_ID, due: value.today }
				: { anchor: NEW_TASK_ANCHOR, due: null },
		);
	};

	return (
		<TasksContext value={value}>
			<div className="tasksPaneFrame">
				<section ref={attachPane} className="activityTimelinePane tasksPane">
					<TasksHeader
						view={view}
						subtitle={view === "today" ? fullDisplayDate(value.today, value.dateFormat) : null}
						onViewChange={changeView}
						onNewTask={openNewTask}
					/>
					{value.quickAdd?.anchor === NEW_TASK_ANCHOR ? (
						<div className="tasksQuickAddSlot">
							<QuickAdd due={value.quickAdd.due} />
						</div>
					) : null}
					<TaskViewContent view={view} paneElement={paneElement} onViewChange={changeView} />
				</section>
				<TaskUndoBar />
			</div>
		</TasksContext>
	);
});
