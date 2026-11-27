import { useTranslation } from "react-i18next";
import { useSpace } from "@/contexts";
import type { TaskQueryFilters } from "@/lib/tauri";
import { TaskBoard } from "../board/TaskBoard";
import { useTaskRecords } from "../data/useTaskRecords";
import { TaskDisplayPopover } from "../filters/TaskDisplayPopover";
import { TaskFilterBar } from "../filters/TaskFilterBar";
import { TasksList } from "../list/TasksList";
import { buildAllRows } from "../model/allRows";
import type { TaskDisplayState } from "../model/taskDisplay";
import { isOpenStatus } from "@/lib/taskFields/taskStatus";
import { useTasks } from "../TasksContext";
import { hasActiveFilters } from "../filters/taskFilterKinds";
import { EMPTY_TASK_FILTERS, type TaskFilterState } from "../viewState/taskViewState";
import { useTaskViewState } from "../viewState/useTaskViewState";
import { TasksQueryState } from "./TasksQueryState";

function queryFilters(filters: TaskFilterState, display: TaskDisplayState): TaskQueryFilters {
	const wantsClosed = filters.statuses.some((status) => !isOpenStatus(status));
	return {
		...filters,
		include_done: display.includeDone || display.layout === "board" || wantsClosed,
	};
}

export function AllView({ paneElement }: { paneElement: HTMLElement | null }) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { today } = useTasks();
	const viewState = useTaskViewState(spacePath);
	const { filters, display } = viewState.state;
	const { query, records } = useTaskRecords({
		view: "all",
		filters: queryFilters(filters, display),
		enabled: viewState.ready,
	});
	const isBoard = display.layout === "board";

	const toolbar = (
		<div className="tasksToolbar">
			<TaskFilterBar filters={filters} onChange={viewState.setFilters} />
			<TaskDisplayPopover display={display} onChange={viewState.setDisplay} />
		</div>
	);

	if (!query.data) {
		return (
			<>
				{toolbar}
				<TasksQueryState query={query} />
			</>
		);
	}
	return (
		<>
			{toolbar}
			{isBoard ? (
				<TaskBoard records={records} orderBy={display.orderBy} paneElement={paneElement} />
			) : (
				<TasksList
					rows={buildAllRows({ records, display, hasFilters: hasActiveFilters(filters), today, t })}
					paneElement={paneElement}
					keepsDone={display.includeDone}
					actions={{ onClearFilters: () => viewState.setFilters(EMPTY_TASK_FILTERS) }}
				/>
			)}
		</>
	);
}
