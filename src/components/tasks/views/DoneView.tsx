import { useTranslation } from "react-i18next";
import { weekStartsOnForLocale } from "@/components/app/calendar/monthGrid";
import { NO_TASK_FILTERS } from "../data/taskQueries";
import { useTaskRecords } from "../data/useTaskRecords";
import { TasksList } from "../list/TasksList";
import { buildDoneRows } from "../model/doneRows";
import { useTasks } from "../TasksContext";
import { TasksQueryState } from "./TasksQueryState";

const DONE_FILTERS = { ...NO_TASK_FILTERS, include_done: true };

export function DoneView({ paneElement }: { paneElement: HTMLElement | null }) {
	const { t } = useTranslation("shell");
	const { today, locale } = useTasks();
	const { query, records } = useTaskRecords({ view: "done", filters: DONE_FILTERS });
	if (!query.data) return <TasksQueryState query={query} />;
	const rows = buildDoneRows({ records, today, weekStartsOn: weekStartsOnForLocale(locale), t });
	return <TasksList rows={rows} paneElement={paneElement} actions={{}} />;
}
