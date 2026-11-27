import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Calendar03Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatTagLabel } from "@/components/editor/noteProperties/utils";
import type { QuickAddParse, QuickAddToken } from "@/lib/taskFields/quickAdd";
import { dueTone } from "../model/taskDates";
import { priorityLabelKey } from "../model/taskPriority";
import { useDueLabel } from "../row/TaskDateChip";
import { TaskPriorityIcon } from "../row/TaskPriorityIcon";
import { useTasks } from "../TasksContext";

interface QuickAddChipsProps {
	parsed: QuickAddParse;
	presetDue: string | null;
	onRemoveToken: (token: QuickAddToken) => void;
	onRemovePreset: () => void;
}

function Chip({
	tone,
	label,
	icon,
	onRemove,
}: {
	tone?: string;
	label: string;
	icon: ReactNode;
	onRemove: () => void;
}) {
	const { t } = useTranslation("shell");
	return (
		<span className="tasksQuickAddChip" data-tone={tone}>
			{icon}
			<span>{label}</span>
			<button
				type="button"
				className="tasksQuickAddChipRemove"
				aria-label={t("tasks.quickAdd.removeToken", { token: label })}
				onClick={onRemove}
			>
				<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-xs)" aria-hidden="true" />
			</button>
		</span>
	);
}

export function QuickAddChips({
	parsed,
	presetDue,
	onRemoveToken,
	onRemovePreset,
}: QuickAddChipsProps) {
	const { t } = useTranslation("shell");
	const { today } = useTasks();
	const dueLabel = useDueLabel();
	const calendarIcon = (
		<HugeiconsIcon icon={Calendar03Icon} size="var(--icon-xs)" aria-hidden="true" />
	);
	const chips = parsed.tokens.map((token) => {
		const remove = () => onRemoveToken(token);
		const key = `${token.kind}:${token.start}`;
		switch (token.kind) {
			case "due":
				return parsed.due ? (
					<Chip
						key={key}
						tone={dueTone(parsed.due, today)}
						label={dueLabel(parsed.due)}
						icon={calendarIcon}
						onRemove={remove}
					/>
				) : null;
			case "priority":
				return (
					<Chip
						key={key}
						label={t(priorityLabelKey(parsed.priority))}
						icon={<TaskPriorityIcon priority={parsed.priority} />}
						onRemove={remove}
					/>
				);
			case "tag":
				return <Chip key={key} label={formatTagLabel(token.value)} icon={null} onRemove={remove} />;
		}
	});
	const showPreset = presetDue !== null && parsed.due === null;
	if (!showPreset && chips.length === 0) return null;
	return (
		<div className="tasksQuickAddChips">
			{showPreset ? (
				<Chip
					tone={dueTone(presetDue, today)}
					label={dueLabel(presetDue)}
					icon={calendarIcon}
					onRemove={onRemovePreset}
				/>
			) : null}
			{chips}
		</div>
	);
}
