import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { TaskEmptyState } from "../empty/TaskEmptyState";
import type {
	TaskAddRow as TaskAddRowModel,
	TaskFooterRow as TaskFooterRowModel,
	TaskListRow,
} from "../model/taskRows";
import { QuickAdd } from "../quickAdd/QuickAdd";
import { TaskRow } from "../row/TaskRow";
import { useTasks } from "../TasksContext";
import { DraggableTaskRow } from "./DraggableTaskRow";
import { TaskSectionHeader } from "./TaskSectionHeader";

export interface TaskRowActions {
	draggable?: boolean;
	onToggleFooter?: () => void;
	onSeeAll?: () => void;
	onClearFilters?: () => void;
}

function TaskAddRow({ row }: { row: TaskAddRowModel }) {
	const { openQuickAdd } = useTasks();
	return (
		<button
			type="button"
			className="tasksAddRow"
			onClick={() => openQuickAdd({ anchor: row.id, due: row.due })}
		>
			<span className="tasksAddRowIcon" aria-hidden="true">
				<HugeiconsIcon icon={PlusSignIcon} size="var(--icon-sm)" />
			</span>
			<span>{row.label}</span>
		</button>
	);
}

function TaskFooterRow({ row, onToggle }: { row: TaskFooterRowModel; onToggle?: () => void }) {
	const { t } = useTranslation("shell");
	return (
		<button
			type="button"
			className="tasksFooterRow"
			aria-expanded={row.expanded}
			onClick={onToggle}
		>
			<HugeiconsIcon
				icon={ArrowRight01Icon}
				size="var(--icon-xs)"
				className="tasksFooterChevron"
				aria-hidden="true"
			/>
			<span>{t("tasks.completedToday", { count: row.count })}</span>
		</button>
	);
}

export function TaskRowView({ row, actions }: { row: TaskListRow; actions: TaskRowActions }) {
	const { quickAdd } = useTasks();
	switch (row.kind) {
		case "section":
			return <TaskSectionHeader row={row} />;
		case "task":
			return actions.draggable ? <DraggableTaskRow row={row} /> : <TaskRow row={row} />;
		case "add":
			return quickAdd?.anchor === row.id ? <QuickAdd due={row.due} /> : <TaskAddRow row={row} />;
		case "footer":
			return <TaskFooterRow row={row} onToggle={actions.onToggleFooter} />;
		case "empty":
			return (
				<TaskEmptyState
					variant={row.variant}
					onSeeAll={actions.onSeeAll}
					onClearFilters={actions.onClearFilters}
				/>
			);
		default: {
			const _exhaustive: never = row;
			return _exhaustive;
		}
	}
}
