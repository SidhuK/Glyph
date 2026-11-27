import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskRecord } from "@/lib/tauri";
import { NO_TASK_FILTERS } from "../data/taskQueries";
import { useTaskRecords } from "../data/useTaskRecords";
import { TasksList, type TasksListHandle } from "../list/TasksList";
import { addIsoDays } from "../model/taskDates";
import type { TaskListRow } from "../model/taskRows";
import { isOpenStatus } from "@/lib/taskFields/taskStatus";
import { buildUpcomingRows } from "../model/upcomingRows";
import { useTasks } from "../TasksContext";
import { WEEK_STRIP_DAYS, WeekStrip } from "../upcoming/WeekStrip";
import { TasksQueryState } from "./TasksQueryState";

function openCountsByDay(records: readonly TaskRecord[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const record of records) {
		if (!record.due || !isOpenStatus(record.status_kind)) continue;
		counts.set(record.due, (counts.get(record.due) ?? 0) + 1);
	}
	return counts;
}

function stickyStripOffset(strip: HTMLElement | null): number {
	if (!strip) return 0;
	const top = Number.parseFloat(getComputedStyle(strip).top);
	return strip.offsetHeight + (Number.isFinite(top) ? top : 0);
}

function droppedTask(event: DragEndEvent, rows: readonly TaskListRow[]) {
	if (event.canceled) return null;
	const { source, target } = event.operation;
	const rowId = source?.data.rowId;
	const isoDate = target?.data.isoDate;
	if (typeof rowId !== "string" || typeof isoDate !== "string") return null;
	const row = rows.find((candidate) => candidate.id === rowId);
	return row?.kind === "task" ? { record: row.record, isoDate } : null;
}

export function UpcomingView({ paneElement }: { paneElement: HTMLElement | null }) {
	const { t } = useTranslation("shell");
	const { today, locale, dateFormat, reschedule } = useTasks();
	const [stripStart, setStripStart] = useState(today);
	const listRef = useRef<TasksListHandle>(null);
	const [stripElement, setStripElement] = useState<HTMLDivElement | null>(null);
	const { query, records } = useTaskRecords({ view: "upcoming", filters: NO_TASK_FILTERS });
	if (!query.data) return <TasksQueryState query={query} />;

	const stripEnd = addIsoDays(stripStart, WEEK_STRIP_DAYS - 1);
	const minimumEnd = addIsoDays(today, WEEK_STRIP_DAYS - 1);
	const lastDay = stripEnd > minimumEnd ? stripEnd : minimumEnd;
	const { rows, dayRowIndex } = buildUpcomingRows({
		records,
		today,
		lastDay,
		locale,
		dateFormat,
		t,
	});

	const handleDragEnd = (event: DragEndEvent) => {
		const dropped = droppedTask(event, rows);
		if (dropped && dropped.record.due !== dropped.isoDate)
			reschedule([dropped.record], dropped.isoDate);
	};

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<WeekStrip
				ref={setStripElement}
				start={stripStart}
				openCounts={openCountsByDay(records)}
				onStartChange={setStripStart}
				onSelectDay={(isoDate) => {
					const index = dayRowIndex.get(isoDate);
					if (index !== undefined) listRef.current?.scrollToRow(index);
				}}
			/>
			<TasksList
				ref={listRef}
				rows={rows}
				paneElement={paneElement}
				stickyOffset={stickyStripOffset(stripElement)}
				actions={{ draggable: true }}
			/>
		</DragDropProvider>
	);
}
