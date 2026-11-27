import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { useTasks } from "../TasksContext";
import type { TaskFilterState } from "../viewState/taskViewState";
import { TaskFilterEditor } from "./TaskFilterEditor";
import {
	TASK_FILTER_ICONS,
	type TaskFilterKind,
	clearFilter,
	filterOperator,
} from "./taskFilterKinds";
import { filterValueSummary } from "./taskFilterSummary";

interface TaskFilterChipProps {
	kind: TaskFilterKind;
	filters: TaskFilterState;
	startOpen: boolean;
	onChange: (filters: TaskFilterState) => void;
	onClosed: () => void;
}

function ChipLabel({ kind, value }: { kind: TaskFilterKind; value: string }) {
	const { t } = useTranslation("shell");
	const operator = filterOperator(kind);
	return (
		<>
			<HugeiconsIcon icon={TASK_FILTER_ICONS[kind]} size="var(--icon-xs)" aria-hidden="true" />
			<span className="tasksFilterChipName">{t(`tasks.filters.kinds.${kind}`)}</span>
			{value ? (
				<>
					{operator ? (
						<span className="tasksFilterChipOp">{t(`tasks.filters.ops.${operator}`)}</span>
					) : null}
					<span className="tasksFilterChipValue">{value}</span>
				</>
			) : null}
		</>
	);
}

export function TaskFilterChip({
	kind,
	filters,
	startOpen,
	onChange,
	onClosed,
}: TaskFilterChipProps) {
	const { t } = useTranslation("shell");
	const { locale, dateFormat } = useTasks();
	const [open, setOpen] = useState(startOpen);
	const value = filterValueSummary(kind, filters, { t, locale, dateFormat });
	const name = t(`tasks.filters.kinds.${kind}`);
	return (
		<div className="tasksFilterChip" data-empty={value || kind === "dueNone" ? undefined : "true"}>
			{kind === "dueNone" ? (
				<span className="tasksFilterChipMain">
					<ChipLabel kind={kind} value="" />
				</span>
			) : (
				<Popover
					open={open}
					onOpenChange={(nextOpen) => {
						setOpen(nextOpen);
						if (!nextOpen) onClosed();
					}}
				>
					<PopoverTrigger
						render={
							<button
								type="button"
								className="tasksFilterChipMain"
								aria-label={t("tasks.filters.editFilter", { name })}
							/>
						}
					>
						<ChipLabel kind={kind} value={value} />
					</PopoverTrigger>
					<PopoverContent align="start" sideOffset={6} className="tasksPopover">
						<TaskFilterEditor
							kind={kind}
							filters={filters}
							onChange={onChange}
							onDone={() => {
								setOpen(false);
								onClosed();
							}}
						/>
					</PopoverContent>
				</Popover>
			)}
			<button
				type="button"
				className="tasksFilterChipRemove"
				aria-label={t("tasks.filters.removeFilter", { name })}
				onClick={() => {
					onChange(clearFilter(kind, filters));
					onClosed();
				}}
			>
				<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-xs)" aria-hidden="true" />
			</button>
		</div>
	);
}
