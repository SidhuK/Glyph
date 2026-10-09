import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrowShrinkIcon,
	CheckListIcon,
	ExpandParagraphIcon,
	NoteIcon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/shadcn/button";
import { TasksScopeSelects, type TasksScopeSelectsProps } from "./TasksScopeSelects";

interface TasksToolbarProps extends TasksScopeSelectsProps {
	search: string;
	onSearchChange: (value: string) => void;
	openTasks: number;
	notes: number;
	onCollapseAll: () => void;
	onExpandAll: () => void;
}

export function TasksToolbar({
	search,
	onSearchChange,
	openTasks,
	notes,
	onCollapseAll,
	onExpandAll,
	...scopeProps
}: TasksToolbarProps) {
	const { t } = useTranslation("shell");
	const openLabel = t("tasks.openTasks", { count: openTasks });
	const notesLabel = t("tasks.noteCount", { count: notes });
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
			<div className="tasksToolbarEnd">
				{notes > 0 ? (
					<>
						<span className="activityDayCounts tasksStat" title={openLabel}>
							<HugeiconsIcon icon={CheckListIcon} size="var(--icon-sm)" aria-hidden="true" />
							<span aria-hidden="true">{openTasks}</span>
							<span className="sr-only">{openLabel}</span>
						</span>
						<span className="activityDayCounts tasksStat" title={notesLabel}>
							<HugeiconsIcon icon={NoteIcon} size="var(--icon-sm)" aria-hidden="true" />
							<span aria-hidden="true">{notes}</span>
							<span className="sr-only">{notesLabel}</span>
						</span>
					</>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					title={t("tasks.collapseAll")}
					aria-label={t("tasks.collapseAll")}
					disabled={!notes}
					onClick={onCollapseAll}
				>
					<HugeiconsIcon icon={ArrowShrinkIcon} size="var(--icon-sm)" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					title={t("tasks.expandAll")}
					aria-label={t("tasks.expandAll")}
					disabled={!notes}
					onClick={onExpandAll}
				>
					<HugeiconsIcon icon={ExpandParagraphIcon} size="var(--icon-sm)" />
				</Button>
			</div>
		</div>
	);
}
