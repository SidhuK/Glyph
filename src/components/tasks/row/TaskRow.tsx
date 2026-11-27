import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { HairlineTagList } from "@/components/database/HairlineTagList";
import type { CssVars } from "@/lib/utils";
import type { TaskItemRow } from "../model/taskRows";
import { taskKey } from "../model/taskIdentity";
import { taskStatusKindOf } from "@/lib/taskFields/taskStatus";
import { taskDisplayTitle } from "../model/taskTitle";
import { useTasks } from "../TasksContext";
import { dismissOnOutsidePointer } from "./dismissOnOutsidePointer";
import { TaskDateChip, TaskInvalidDateFlag } from "./TaskDateChip";
import { TaskExpandedPanel } from "./TaskExpandedPanel";
import { TaskNoteChip } from "./TaskNoteChip";
import { TaskPriorityIcon } from "./TaskPriorityIcon";
import { TaskStatusCircle } from "./TaskStatusCircle";
import { TaskTitleEditor } from "./TaskTitleEditor";

const ROW_TAG_LIMIT = 3;

type Collapse = (options?: { restoreFocus: boolean }) => void;

function collapseOnBackgroundClick(event: MouseEvent<HTMLDivElement>, collapse: Collapse) {
	const target = event.target;
	if (!(target instanceof Element)) return;
	if (
		target === event.currentTarget ||
		target.matches(".tasksRow, .tasksExpandedPanel, .tasksExpandedFooter")
	) {
		collapse();
	}
}

function collapseOnEscape(event: KeyboardEvent<HTMLDivElement>, collapse: Collapse) {
	if (event.key !== "Escape" || !(event.target instanceof Node)) return;
	if (!event.currentTarget.contains(event.target)) return;
	event.preventDefault();
	collapse({ restoreFocus: true });
}

export function TaskRow({ row }: { row: TaskItemRow }) {
	const { t } = useTranslation("shell");
	const { held, expandedId, toggleExpanded, takeFocusReturn, collapse } = useTasks();
	const { record } = row;
	const key = taskKey(record);
	const heldTask = held.get(key);
	const displayStatus = heldTask ? taskStatusKindOf(heldTask.nextStatus) : record.status_kind;
	const expanded = expandedId === row.id;
	const title = taskDisplayTitle(record);
	const hasInvalidDate = record.invalid.includes("due");
	const style: CssVars<"--task-depth"> = { "--task-depth": String(row.depth) };

	return (
		<div className="tasksRowCollapse" data-leaving={heldTask?.leaving ? "true" : undefined}>
			<div
				ref={expanded ? dismissOnOutsidePointer(collapse) : undefined}
				className="tasksItem"
				data-status={displayStatus}
				data-expanded={expanded ? "true" : undefined}
				style={style}
				onClick={expanded ? (event) => collapseOnBackgroundClick(event, collapse) : undefined}
				onKeyDown={expanded ? (event) => collapseOnEscape(event, collapse) : undefined}
			>
				<div className="tasksRow">
					<span className="tasksRowPriority">
						<TaskPriorityIcon priority={record.priority} labelled />
					</span>
					<TaskStatusCircle
						record={record}
						displayStatus={displayStatus}
						animate={Boolean(heldTask)}
					/>
					{expanded ? (
						<TaskTitleEditor record={record} />
					) : (
						<button
							ref={(node) => {
								if (node && takeFocusReturn(row.id)) node.focus({ preventScroll: true });
							}}
							type="button"
							className="tasksRowMain"
							aria-expanded={false}
							onClick={() => toggleExpanded(row.id)}
						>
							<span className="tasksRowTitle">{title || t("tasks.untitled")}</span>
							{record.tags.length > 0 ? (
								<HairlineTagList
									tags={record.tags}
									limit={ROW_TAG_LIMIT}
									className="tasksRowTags"
								/>
							) : null}
							{!row.subtasksInline && record.subtask_total > 0 ? (
								<span
									className="tasksSubtaskChip"
									aria-label={t("tasks.subtaskProgress", {
										done: record.subtask_done,
										total: record.subtask_total,
									})}
								>
									{record.subtask_done}/{record.subtask_total}
								</span>
							) : null}
							<span className="tasksRowSpacer" />
							{hasInvalidDate ? <TaskInvalidDateFlag /> : null}
							{row.showDate && record.due ? <TaskDateChip due={record.due} /> : null}
							{row.showNote ? <TaskNoteChip record={record} /> : null}
						</button>
					)}
				</div>
				{expanded ? <TaskExpandedPanel record={record} /> : null}
			</div>
		</div>
	);
}
