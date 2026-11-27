import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Alert02Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { compactAbsoluteDate, dueTone, fullDisplayDate, weekdayName } from "../model/taskDates";
import { useTasks } from "../TasksContext";

export function TaskInvalidDateFlag() {
	const { t } = useTranslation("shell");
	return (
		<span className="tasksDateChip" data-tone="invalid" title={t("tasks.invalidDateHint")}>
			<HugeiconsIcon icon={Alert02Icon} size="var(--icon-xs)" aria-hidden="true" />
			<span>{t("tasks.invalidDate")}</span>
		</span>
	);
}

export function useDueLabel() {
	const { t } = useTranslation("shell");
	const { today, locale, dateFormat } = useTasks();
	return (due: string) => {
		const tone = dueTone(due, today);
		switch (tone) {
			case "today":
				return t("tasks.date.today");
			case "tomorrow":
				return t("tasks.date.tomorrow");
			case "week":
				return weekdayName(due, locale, "short");
			case "overdue":
			case "later":
				return compactAbsoluteDate(due, dateFormat, locale);
		}
	};
}

export function TaskDateChip({ due }: { due: string }) {
	const { today, dateFormat } = useTasks();
	const label = useDueLabel()(due);
	return (
		<span
			className="tasksDateChip"
			data-tone={dueTone(due, today)}
			title={fullDisplayDate(due, dateFormat)}
		>
			<HugeiconsIcon icon={Calendar03Icon} size="var(--icon-xs)" aria-hidden="true" />
			<span>{label}</span>
		</span>
	);
}
