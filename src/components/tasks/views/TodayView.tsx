import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NO_TASK_FILTERS } from "../data/taskQueries";
import { useTaskRecords } from "../data/useTaskRecords";
import { TasksList } from "../list/TasksList";
import { buildTodayRows } from "../model/todayRows";
import { useTasks } from "../TasksContext";
import { TasksQueryState } from "./TasksQueryState";

interface TodayViewProps {
	paneElement: HTMLElement | null;
	onSeeAll: () => void;
}

export function TodayView({ paneElement, onSeeAll }: TodayViewProps) {
	const { t } = useTranslation("shell");
	const { today } = useTasks();
	const [completedExpanded, setCompletedExpanded] = useState(false);
	const { query, records } = useTaskRecords({ view: "today", filters: NO_TASK_FILTERS });
	if (!query.data) return <TasksQueryState query={query} />;
	const rows = buildTodayRows({ records, today, completedExpanded, t });
	return (
		<TasksList
			rows={rows}
			paneElement={paneElement}
			actions={{ onSeeAll, onToggleFooter: () => setCompletedExpanded((value) => !value) }}
		/>
	);
}
