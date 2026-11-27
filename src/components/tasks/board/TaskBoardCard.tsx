import { useTranslation } from "react-i18next";
import { HairlineTagList } from "@/components/database/HairlineTagList";
import { taskStatusKindOf } from "@/lib/taskFields/taskStatus";
import type { TaskRecord } from "@/lib/tauri";
import { taskKey } from "../model/taskIdentity";
import { useTaskDraggable } from "../list/useTaskDraggable";
import { taskDisplayTitle } from "../model/taskTitle";
import { dismissOnOutsidePointer } from "../row/dismissOnOutsidePointer";
import { TaskDateChip } from "../row/TaskDateChip";
import { TaskExpandedPanel } from "../row/TaskExpandedPanel";
import { TaskNoteChip } from "../row/TaskNoteChip";
import { TaskPriorityIcon } from "../row/TaskPriorityIcon";
import { TaskStatusCircle } from "../row/TaskStatusCircle";
import { TaskTitleEditor } from "../row/TaskTitleEditor";
import { useTasks } from "../TasksContext";

export const TASK_BOARD_CARD_TYPE = "tasks-board-card";

const CARD_TAG_LIMIT = 2;

export function TaskBoardCard({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { held, expandedId, toggleExpanded, collapse, takeFocusReturn } = useTasks();
	const key = taskKey(record);
	const heldTask = held.get(key);
	const displayStatus = heldTask ? taskStatusKindOf(heldTask.nextStatus) : record.status_kind;
	const cardId = `card:${key}`;
	const expanded = expandedId === cardId;
	const { dragRef, isDragging } = useTaskDraggable({
		id: cardId,
		type: TASK_BOARD_CARD_TYPE,
		disabled: expanded,
		data: { taskKey: key },
	});
	return (
		<div
			ref={dragRef}
			className="tasksBoardCardSlot"
			data-dragging={isDragging ? "true" : undefined}
		>
			<div
				ref={expanded ? dismissOnOutsidePointer(collapse) : undefined}
				className="tasksBoardCard"
				data-status={displayStatus}
				data-expanded={expanded ? "true" : undefined}
				onKeyDown={(event) => {
					if (!expanded || event.key !== "Escape" || !(event.target instanceof Node)) return;
					if (!event.currentTarget.contains(event.target)) return;
					event.preventDefault();
					collapse({ restoreFocus: true });
				}}
			>
				<div className="tasksBoardCardHead">
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
								if (node && takeFocusReturn(cardId)) node.focus({ preventScroll: true });
							}}
							type="button"
							className="tasksBoardCardTitle"
							aria-expanded={false}
							onClick={() => toggleExpanded(cardId)}
						>
							{taskDisplayTitle(record) || t("tasks.untitled")}
						</button>
					)}
				</div>
				{expanded ? (
					<TaskExpandedPanel record={record} />
				) : (
					<div className="tasksBoardCardMeta">
						<TaskPriorityIcon priority={record.priority} labelled />
						{record.due ? <TaskDateChip due={record.due} /> : null}
						{record.subtask_total > 0 ? (
							<span className="tasksSubtaskChip">
								{record.subtask_done}/{record.subtask_total}
							</span>
						) : null}
						{record.tags.length > 0 ? (
							<HairlineTagList tags={record.tags} limit={CARD_TAG_LIMIT} />
						) : null}
						<TaskNoteChip record={record} />
					</div>
				)}
			</div>
		</div>
	);
}
