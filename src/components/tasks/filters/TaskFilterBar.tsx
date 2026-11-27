import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemIcon,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { EMPTY_TASK_FILTERS, type TaskFilterState } from "../viewState/taskViewState";
import { TaskFilterChip } from "./TaskFilterChip";
import {
	TASK_FILTER_ICONS,
	TASK_FILTER_KINDS,
	type TaskFilterKind,
	hasActiveFilters,
	isFilterActive,
} from "./taskFilterKinds";

interface TaskFilterBarProps {
	filters: TaskFilterState;
	onChange: (filters: TaskFilterState) => void;
}

export function TaskFilterBar({ filters, onChange }: TaskFilterBarProps) {
	const { t } = useTranslation("shell");
	const [pending, setPending] = useState<TaskFilterKind | null>(null);
	const shown = TASK_FILTER_KINDS.filter(
		(kind) => kind === pending || isFilterActive(kind, filters),
	);
	const available = TASK_FILTER_KINDS.filter((kind) => !shown.includes(kind));

	const addFilter = (kind: TaskFilterKind) => {
		if (kind === "dueNone") {
			onChange({ ...filters, due_none: true });
			return;
		}
		setPending(kind);
	};

	return (
		<div className="tasksFilterBar" role="group" aria-label={t("tasks.filters.label")}>
			{shown.map((kind) => (
				<TaskFilterChip
					key={kind}
					kind={kind}
					filters={filters}
					startOpen={kind === pending}
					onChange={onChange}
					onClosed={() => setPending((current) => (current === kind ? null : current))}
				/>
			))}
			{available.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger render={<button type="button" className="tasksToolbarButton" />}>
						<HugeiconsIcon icon={FilterIcon} size="var(--icon-sm)" aria-hidden="true" />
						<span>{t("tasks.filters.add")}</span>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" sideOffset={6}>
						{available.map((kind) => (
							<DropdownMenuItem key={kind} onClick={() => addFilter(kind)}>
								<DropdownMenuItemIcon icon={TASK_FILTER_ICONS[kind]} />
								<span className="glyphMenuItemLabel">{t(`tasks.filters.kinds.${kind}`)}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{hasActiveFilters(filters) ? (
				<button
					type="button"
					className="tasksToolbarButton"
					data-quiet="true"
					onClick={() => onChange(EMPTY_TASK_FILTERS)}
				>
					{t("tasks.filters.clear")}
				</button>
			) : null}
		</div>
	);
}
