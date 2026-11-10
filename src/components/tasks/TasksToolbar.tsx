import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ClockArrowDownIcon,
	SearchIcon,
	SortingAZ01Icon,
	SortingNineOneIcon,
	UnfoldLessIcon,
	UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/shadcn/button";
import { Select, SelectIcon } from "../ui/shadcn/select";
import type { TaskSortMode } from "./buildTaskRows";
import { TasksScopeSelects, type TasksScopeSelectsProps } from "./TasksScopeSelects";

interface TasksToolbarProps extends TasksScopeSelectsProps {
	search: string;
	onSearchChange: (value: string) => void;
	sort: TaskSortMode;
	onSortChange: (sort: TaskSortMode) => void;
	openTasks: number;
	notes: number;
	anyExpanded: boolean;
	onToggleAll: () => void;
}

export function TasksToolbar({
	search,
	onSearchChange,
	sort,
	onSortChange,
	openTasks,
	notes,
	anyExpanded,
	onToggleAll,
	...scopeProps
}: TasksToolbarProps) {
	const { t } = useTranslation("shell");
	const toggleLabel = t(anyExpanded ? "tasks.collapseAll" : "tasks.expandAll");
	return (
		<div className="tasksToolbar">
			<label className="folioNotesSearch tasksSearch">
				<HugeiconsIcon icon={SearchIcon} size="var(--icon-md)" />
				<input
					type="text"
					inputMode="search"
					value={search}
					placeholder={t("tasks.searchPlaceholder")}
					aria-label={t("tasks.searchPlaceholder")}
					onChange={(event) => onSearchChange(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key !== "Escape" || !search) return;
						event.preventDefault();
						event.stopPropagation();
						onSearchChange("");
					}}
				/>
			</label>
			<TasksScopeSelects {...scopeProps} />
			<Select
				className="tasksScopeSelect"
				aria-label={t("tasks.sort")}
				value={sort}
				options={[
					{
						value: "recent",
						label: t("tasks.sortRecent"),
						icon: <SelectIcon icon={ClockArrowDownIcon} />,
					},
					{
						value: "open",
						label: t("tasks.sortMostOpen"),
						icon: <SelectIcon icon={SortingNineOneIcon} />,
					},
					{
						value: "title",
						label: t("tasks.sortTitle"),
						icon: <SelectIcon icon={SortingAZ01Icon} />,
					},
				]}
				onValueChange={onSortChange}
			/>
			<div className="tasksToolbarEnd">
				{notes > 0 ? (
					<p className="activityHeatmapSummary tasksSummary">
						{`${t("tasks.openTasks", { count: openTasks })} · ${t("tasks.noteCount", { count: notes })}`}
					</p>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					title={toggleLabel}
					aria-label={toggleLabel}
					disabled={!notes}
					onClick={onToggleAll}
				>
					<HugeiconsIcon
						icon={anyExpanded ? UnfoldLessIcon : UnfoldMoreIcon}
						size="var(--icon-sm)"
					/>
				</Button>
			</div>
		</div>
	);
}
