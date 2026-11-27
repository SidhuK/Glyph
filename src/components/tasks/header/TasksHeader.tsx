import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { TaskView } from "@/lib/tauri";
import { useTasks } from "../TasksContext";

const TASK_VIEWS = ["today", "upcoming", "all", "done"] as const satisfies readonly TaskView[];

function adjacentView(view: TaskView, key: string): TaskView | null {
	const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
	if (step === 0) return null;
	const index = TASK_VIEWS.indexOf(view);
	return TASK_VIEWS[(index + step + TASK_VIEWS.length) % TASK_VIEWS.length] ?? null;
}

interface TasksHeaderProps {
	view: TaskView;
	subtitle: string | null;
	onViewChange: (view: TaskView) => void;
	onNewTask: () => void;
}

export function TasksHeader({ view, subtitle, onViewChange, onNewTask }: TasksHeaderProps) {
	const { t } = useTranslation("shell");
	const { quickAdd } = useTasks();
	return (
		<header className="activityTimelineHeader tasksHeader">
			<div className="tasksHeaderTop">
				<div className="tasksHeaderTitles">
					<h1 className="activityTimelineTitle">{t(`tasks.views.${view}.title`)}</h1>
					<p className="tasksHeaderSubtitle" aria-hidden={subtitle ? undefined : true}>
						{subtitle}
					</p>
				</div>
				<div className="tasksHeaderActions">
					<div
						className="tasksViewSwitch"
						role="tablist"
						aria-label={t("tasks.views.label")}
						onKeyDown={(event) => {
							const next = adjacentView(view, event.key);
							if (!next) return;
							event.preventDefault();
							onViewChange(next);
							event.currentTarget.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus();
						}}
					>
						{TASK_VIEWS.map((candidate) => (
							<button
								key={candidate}
								type="button"
								role="tab"
								data-view={candidate}
								tabIndex={candidate === view ? 0 : -1}
								aria-selected={candidate === view}
								className="tasksViewSwitchItem"
								onClick={() => onViewChange(candidate)}
							>
								{t(`tasks.views.${candidate}.tab`)}
							</button>
						))}
					</div>
					<button
						type="button"
						className="tasksNewTaskButton"
						disabled={quickAdd !== null}
						onClick={onNewTask}
					>
						<HugeiconsIcon icon={PlusSignIcon} size="var(--icon-sm)" aria-hidden="true" />
						<span>{t("tasks.newTask")}</span>
					</button>
				</div>
			</div>
		</header>
	);
}
