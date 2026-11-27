import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Calendar03Icon, File01Icon, HashtagIcon } from "@hugeicons/core-free-icons";
import type { TaskSectionIcon, TaskSectionRow } from "../model/taskRows";
import { RescheduleButton } from "../menus/RescheduleButton";
import { TaskPriorityIcon } from "../row/TaskPriorityIcon";
import { TaskStatusGlyph } from "../row/TaskStatusGlyph";

function SectionIcon({ icon }: { icon: TaskSectionIcon }) {
	switch (icon.kind) {
		case "status":
			return <TaskStatusGlyph status={icon.status} />;
		case "priority":
			return <TaskPriorityIcon priority={icon.priority} />;
		case "note":
			return <HugeiconsIcon icon={File01Icon} size="var(--icon-sm)" aria-hidden="true" />;
		case "tag":
			return <HugeiconsIcon icon={HashtagIcon} size="var(--icon-sm)" aria-hidden="true" />;
		case "due":
			return <HugeiconsIcon icon={Calendar03Icon} size="var(--icon-sm)" aria-hidden="true" />;
		default: {
			const _exhaustive: never = icon;
			return _exhaustive;
		}
	}
}

export function TaskSectionHeader({ row }: { row: TaskSectionRow }) {
	return (
		<div className="tasksSection" data-tone={row.tone}>
			<h2 className="tasksSectionHeading">
				{row.icon ? (
					<span className="tasksSectionIcon">
						<SectionIcon icon={row.icon} />
					</span>
				) : null}
				<span className="tasksSectionLabel">{row.label}</span>
				{row.detail ? <span className="tasksSectionDetail">{row.detail}</span> : null}
				{row.count !== null ? <span className="tasksSectionCount">{row.count}</span> : null}
			</h2>
			{row.reschedule && row.reschedule.length > 0 ? (
				<RescheduleButton records={row.reschedule} />
			) : null}
		</div>
	);
}
