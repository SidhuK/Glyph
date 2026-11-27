import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useDroppable } from "@dnd-kit/react";
import { parseISO } from "date-fns";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { TASK_DRAG_TYPE } from "../list/DraggableTaskRow";
import { addIsoDays, fullDisplayDate, monthHeading, weekdayName } from "../model/taskDates";
import { useTasks } from "../TasksContext";

export const WEEK_STRIP_DAYS = 7;
const MAX_DAY_DOTS = 4;

interface WeekStripProps {
	start: string;
	openCounts: ReadonlyMap<string, number>;
	onStartChange: (start: string) => void;
	onSelectDay: (isoDate: string) => void;
	ref?: Ref<HTMLDivElement>;
}

function WeekStripDay({
	isoDate,
	count,
	onSelect,
}: {
	isoDate: string;
	count: number;
	onSelect: () => void;
}) {
	const { t } = useTranslation("shell");
	const { today, locale, dateFormat } = useTasks();
	const { ref, isDropTarget } = useDroppable({
		id: `tasks-day:${isoDate}`,
		accept: TASK_DRAG_TYPE,
		data: { isoDate },
	});
	const label = fullDisplayDate(isoDate, dateFormat);
	return (
		<button
			ref={ref}
			type="button"
			className="tasksWeekDay"
			data-today={isoDate === today ? "true" : undefined}
			data-drop-target={isDropTarget ? "true" : undefined}
			aria-label={t("tasks.upcoming.dayLabel", { date: label, count })}
			onClick={onSelect}
		>
			<span className="tasksWeekDayName">{weekdayName(isoDate, locale, "short")}</span>
			<span className="tasksWeekDayNumber">{parseISO(isoDate).getDate()}</span>
			<span className="tasksWeekDayDots" aria-hidden="true">
				{Array.from({ length: Math.min(count, MAX_DAY_DOTS) }, (_, index) => (
					<span key={index} className="tasksWeekDayDot" />
				))}
			</span>
		</button>
	);
}

export function WeekStrip({ start, openCounts, onStartChange, onSelectDay, ref }: WeekStripProps) {
	const { t } = useTranslation("shell");
	const { today, locale } = useTasks();
	const days = Array.from({ length: WEEK_STRIP_DAYS }, (_, index) => addIsoDays(start, index));
	return (
		<div ref={ref} className="tasksWeekStrip">
			<div className="tasksWeekStripHeader">
				<span className="tasksWeekStripMonth">{monthHeading(start, locale)}</span>
				<div className="tasksWeekStripNav">
					<button
						type="button"
						className="tasksIconButton"
						aria-label={t("tasks.upcoming.previousWeek")}
						disabled={start <= today}
						onClick={() => {
							const previous = addIsoDays(start, -WEEK_STRIP_DAYS);
							onStartChange(previous < today ? today : previous);
						}}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-sm)" aria-hidden="true" />
					</button>
					<button
						type="button"
						className="tasksWeekStripToday"
						disabled={start === today}
						onClick={() => {
							onStartChange(today);
							onSelectDay(today);
						}}
					>
						{t("tasks.date.today")}
					</button>
					<button
						type="button"
						className="tasksIconButton"
						aria-label={t("tasks.upcoming.nextWeek")}
						onClick={() => onStartChange(addIsoDays(start, WEEK_STRIP_DAYS))}
					>
						<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-sm)" aria-hidden="true" />
					</button>
				</div>
			</div>
			<div className="tasksWeekDays" role="group" aria-label={t("tasks.upcoming.week")}>
				{days.map((isoDate) => (
					<WeekStripDay
						key={isoDate}
						isoDate={isoDate}
						count={openCounts.get(isoDate) ?? 0}
						onSelect={() => onSelectDay(isoDate)}
					/>
				))}
			</div>
		</div>
	);
}
