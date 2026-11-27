import { useTranslation } from "react-i18next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { TASK_STATUS_CHAR, TASK_STATUS_KINDS } from "@/lib/taskFields/taskStatus";
import type { TaskRecord, TaskStatusKind } from "@/lib/tauri";
import { TaskStatusGlyph } from "../row/TaskStatusGlyph";
import { useTasks } from "../TasksContext";

export function TaskStatusOptionContent({
	kind,
	selected,
}: {
	kind: TaskStatusKind;
	selected: boolean;
}) {
	const { t } = useTranslation("shell");
	return (
		<>
			<TaskStatusGlyph status={kind} className="glyphMenuItemIcon" />
			<span className="glyphMenuItemLabel">{t(`tasks.status.${kind}`)}</span>
			{selected ? <DropdownMenuItemCheck /> : null}
		</>
	);
}

export function TaskStatusButton({ record }: { record: TaskRecord }) {
	const { t } = useTranslation("shell");
	const { setStatus } = useTasks();
	const label = t(`tasks.status.${record.status_kind}`);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="tasksPropertyButton"
						aria-label={t("tasks.properties.statusLabel", { value: label })}
					/>
				}
			>
				<TaskStatusGlyph status={record.status_kind} />
				<span>{label}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" sideOffset={6}>
				{TASK_STATUS_KINDS.map((kind) => (
					<DropdownMenuItem key={kind} onClick={() => setStatus(record, TASK_STATUS_CHAR[kind])}>
						<TaskStatusOptionContent kind={kind} selected={record.status_kind === kind} />
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
