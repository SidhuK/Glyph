import { ContextMenu } from "@animate-ui/react/primitives/base-ui/context-menu";
import { useTranslation } from "react-i18next";
import { TASK_STATUS_CHAR, TASK_STATUS_KINDS, isOpenStatus } from "@/lib/taskFields/taskStatus";
import type { TaskRecord, TaskStatusKind } from "@/lib/tauri";
import { taskDisplayTitle } from "../model/taskTitle";
import { TaskStatusGlyph } from "./TaskStatusGlyph";
import { useTasks } from "../TasksContext";
import { TaskStatusOptionContent } from "../menus/TaskStatusButton";

interface TaskStatusCircleProps {
	record: TaskRecord;
	displayStatus: TaskStatusKind;
	animate: boolean;
}

export function TaskStatusCircle({ record, displayStatus, animate }: TaskStatusCircleProps) {
	const { t } = useTranslation("shell");
	const { toggleCircle, setStatus } = useTasks();
	const title = taskDisplayTitle(record);
	const label = t(isOpenStatus(displayStatus) ? "tasks.markDone" : "tasks.reopen", { task: title });
	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger
				render={
					<button
						type="button"
						className="tasksStatusButton"
						aria-label={label}
						title={t("tasks.statusHint")}
						onClick={(event) => {
							event.stopPropagation();
							toggleCircle(record);
						}}
					/>
				}
			>
				<TaskStatusGlyph status={displayStatus} className={animate ? "is-filling" : undefined} />
			</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<ContextMenu.Positioner className="glyphMenuPositioner">
					<ContextMenu.Popup className="glyphMenuPopup" aria-label={t("tasks.statusMenu")}>
						{TASK_STATUS_KINDS.map((kind) => (
							<ContextMenu.Item
								key={kind}
								className="glyphMenuItem"
								onClick={() => setStatus(record, TASK_STATUS_CHAR[kind])}
							>
								<TaskStatusOptionContent kind={kind} selected={record.status_kind === kind} />
							</ContextMenu.Item>
						))}
					</ContextMenu.Popup>
				</ContextMenu.Positioner>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
}
