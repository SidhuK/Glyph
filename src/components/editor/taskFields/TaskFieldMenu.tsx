import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TASK_PRIORITIES, taskPriorityName } from "../../../lib/taskFields/taskPriority";
import {
	TASK_STATUS_CHAR,
	TASK_STATUS_KINDS,
	taskStatusKindOf,
} from "../../../lib/taskFields/taskStatus";
import type { TaskPriority } from "../../../lib/tauri";
import { TaskDatePicker } from "../../taskDatePicker/TaskDatePicker";
import { TaskPriorityIcon } from "../../tasks/row/TaskPriorityIcon";
import { TaskStatusGlyph } from "../../tasks/row/TaskStatusGlyph";
import { Popover, PopoverContent } from "../../ui/shadcn/popover";
import { type TaskOption, TaskOptionMenu } from "./TaskOptionMenu";
import type { OpenTaskFieldMenu } from "./useTaskFieldMenu";
import "./taskFieldMenu.css";

interface TaskFieldMenuProps {
	request: OpenTaskFieldMenu;
	anchorRect: DOMRect | null;
	onClose: (restoreFocus: boolean) => void;
	onSetDue: (isoDate: string) => void;
	onRemoveDue: () => void;
	onSetPriority: (priority: TaskPriority) => void;
	onSetStatus: (status: string) => void;
}

function TaskPriorityMenu({
	request,
	onSetPriority,
}: Pick<TaskFieldMenuProps, "request" | "onSetPriority">) {
	const { t } = useTranslation("editor");
	const options: TaskOption[] = TASK_PRIORITIES.map((priority) => ({
		id: String(priority),
		label: t(`taskFields.priority.${taskPriorityName(priority)}`),
		icon: <TaskPriorityIcon priority={priority} />,
		selected: request.fields.priority === priority,
		keywords:
			priority > 0
				? [taskPriorityName(priority), "!".repeat(priority)]
				: [taskPriorityName(priority)],
	}));
	return (
		<TaskOptionMenu
			label={t("slash.taskPriority.title")}
			options={options}
			query={request.query}
			onSelect={(id) => {
				const priority = TASK_PRIORITIES.find((candidate) => String(candidate) === id);
				if (priority !== undefined) onSetPriority(priority);
			}}
		/>
	);
}

function TaskStatusMenu({
	request,
	onSetStatus,
}: Pick<TaskFieldMenuProps, "request" | "onSetStatus">) {
	const { t } = useTranslation("editor");
	const currentKind = taskStatusKindOf(request.fields.status);
	const options: TaskOption[] = TASK_STATUS_KINDS.map((kind) => ({
		id: TASK_STATUS_CHAR[kind],
		label: t(`taskFields.status.${kind}`),
		icon: <TaskStatusGlyph status={kind} className="glyphMenuItemIcon" />,
		hint: `[${TASK_STATUS_CHAR[kind]}]`,
		selected: currentKind === kind,
		keywords: [kind.replace("_", " "), TASK_STATUS_CHAR[kind]],
	}));
	return (
		<TaskOptionMenu
			label={t("slash.taskStatus.title")}
			options={options}
			query={request.query}
			onSelect={onSetStatus}
		/>
	);
}

export function TaskFieldMenu({
	request,
	anchorRect,
	onClose,
	onSetDue,
	onRemoveDue,
	onSetPriority,
	onSetStatus,
}: TaskFieldMenuProps) {
	const anchor = useMemo(() => {
		const rect = anchorRect ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 1, 1);
		return { getBoundingClientRect: () => rect };
	}, [anchorRect]);

	return (
		<Popover
			open
			onOpenChange={(open, details) => {
				if (!open) onClose(details.reason === "escape-key");
			}}
		>
			<PopoverContent
				anchor={anchor}
				side="bottom"
				align="start"
				sideOffset={6}
				collisionPadding={8}
				className="taskFieldMenuPopover"
				finalFocus={false}
			>
				{request.kind === "due" ? (
					<TaskDatePicker
						value={request.fields.due}
						query={request.query}
						onSelect={onSetDue}
						onRemove={request.fields.due ? onRemoveDue : undefined}
					/>
				) : null}
				{request.kind === "priority" ? (
					<TaskPriorityMenu request={request} onSetPriority={onSetPriority} />
				) : null}
				{request.kind === "status" ? (
					<TaskStatusMenu request={request} onSetStatus={onSetStatus} />
				) : null}
			</PopoverContent>
		</Popover>
	);
}
