import { useTranslation } from "react-i18next";
import { TaskDatePicker } from "@/components/taskDatePicker/TaskDatePicker";
import { TASK_PRIORITIES, isTaskPriority } from "@/lib/taskFields/taskPriority";
import { priorityFilterLabelKey } from "../model/taskPriority";
import { TASK_STATUS_KINDS } from "@/lib/taskFields/taskStatus";
import { TaskPriorityIcon } from "../row/TaskPriorityIcon";
import { TaskStatusGlyph } from "../row/TaskStatusGlyph";
import type { TaskFilterState } from "../viewState/taskViewState";
import { TaskCheckList } from "./TaskCheckList";
import { FolderFilterEditor, NoteFilterEditor, TagFilterEditor } from "./TaskFilterListEditors";
import { type TaskFilterKind, toggledValue } from "./taskFilterKinds";

const NO_PRIORITY_ID = "none";

interface TaskFilterEditorProps {
	kind: Exclude<TaskFilterKind, "dueNone">;
	filters: TaskFilterState;
	onChange: (filters: TaskFilterState) => void;
	onDone: () => void;
}

function StatusFilterEditor({ filters, onChange }: Omit<TaskFilterEditorProps, "kind" | "onDone">) {
	const { t } = useTranslation("shell");
	return (
		<TaskCheckList
			label={t("tasks.filters.kinds.status")}
			items={TASK_STATUS_KINDS.map((kind) => ({
				id: kind,
				label: t(`tasks.status.${kind}`),
				icon: <TaskStatusGlyph status={kind} />,
				selected: filters.statuses.includes(kind),
			}))}
			onToggle={(id) => {
				const kind = TASK_STATUS_KINDS.find((candidate) => candidate === id);
				if (kind) onChange({ ...filters, statuses: toggledValue(filters.statuses, kind) });
			}}
		/>
	);
}

function PriorityFilterEditor({
	filters,
	onChange,
}: Omit<TaskFilterEditorProps, "kind" | "onDone">) {
	const { t } = useTranslation("shell");
	return (
		<TaskCheckList
			label={t("tasks.filters.kinds.priority")}
			items={[
				...TASK_PRIORITIES.map((priority) => ({
					id: String(priority),
					label: t(priorityFilterLabelKey(priority)),
					icon: <TaskPriorityIcon priority={priority} />,
					selected: filters.priorities.includes(priority),
				})),
				{
					id: NO_PRIORITY_ID,
					label: t("tasks.priority.none"),
					icon: <TaskPriorityIcon priority={null} />,
					selected: filters.include_no_priority,
				},
			]}
			onToggle={(id) => {
				if (id === NO_PRIORITY_ID) {
					onChange({ ...filters, include_no_priority: !filters.include_no_priority });
					return;
				}
				const priority = Number(id);
				if (isTaskPriority(priority)) {
					onChange({ ...filters, priorities: toggledValue(filters.priorities, priority) });
				}
			}}
		/>
	);
}

export function TaskFilterEditor({ kind, filters, onChange, onDone }: TaskFilterEditorProps) {
	switch (kind) {
		case "note":
			return (
				<NoteFilterEditor
					selected={filters.note_paths}
					onChange={(note_paths) => onChange({ ...filters, note_paths })}
				/>
			);
		case "folder":
			return (
				<FolderFilterEditor
					selected={filters.folder_prefixes}
					onChange={(folder_prefixes) => onChange({ ...filters, folder_prefixes })}
				/>
			);
		case "tag":
			return (
				<TagFilterEditor
					selected={filters.tags}
					onChange={(tags) => onChange({ ...filters, tags })}
				/>
			);
		case "status":
			return <StatusFilterEditor filters={filters} onChange={onChange} />;
		case "priority":
			return <PriorityFilterEditor filters={filters} onChange={onChange} />;
		case "dueBefore":
			return (
				<TaskDatePicker
					value={filters.due_before}
					onSelect={(due_before) => {
						onChange({ ...filters, due_before });
						onDone();
					}}
				/>
			);
		case "dueAfter":
			return (
				<TaskDatePicker
					value={filters.due_after}
					onSelect={(due_after) => {
						onChange({ ...filters, due_after });
						onDone();
					}}
				/>
			);
	}
}
