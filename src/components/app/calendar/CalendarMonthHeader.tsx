import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { CollapsibleTrigger } from "@/components/ui/shadcn/collapsible";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { isoWeekFromDate } from "../../../lib/periodNotes";
import type { CalendarTitleAction } from "./CalendarMonth";
import { MIDWEEK_OFFSET } from "./monthGrid";

interface CalendarMonthHeaderProps {
	month: Date;
	locale: string;
	visibleWeek: Date[] | null;
	showToday: boolean;
	titleAction: CalendarTitleAction | null;
	/** Shows the fold toggle; the calendar's `Collapsible` owns the open state. */
	collapsible: boolean;
	collapsed: boolean;
	onGoToToday: () => void;
	onStep: (delta: number) => void;
}

/** Month title with the today, previous/next and fold controls. */
export function CalendarMonthHeader({
	month,
	locale,
	visibleWeek,
	showToday,
	titleAction,
	collapsible,
	collapsed,
	onGoToToday,
	onStep,
}: CalendarMonthHeaderProps) {
	const { t } = useTranslation("shell");
	const isWeek = visibleWeek !== null;
	const collapseLabel = collapsed ? t("sidebarCalendar.expand") : t("sidebarCalendar.collapse");
	const title = visibleWeek ? (
		<>
			{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).formatRange(
				visibleWeek[0],
				visibleWeek[visibleWeek.length - 1],
			)}{" "}
			<span className="calendarMonthTitleYear">
				{t("calendar.weekNumber", { week: isoWeekFromDate(visibleWeek[MIDWEEK_OFFSET]).week })}
			</span>
		</>
	) : (
		// Locale order and separators (e.g. "2026年10月"), with only the year muted.
		new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
			.formatToParts(month)
			.map((part, index) =>
				part.type === "year" ? (
					<span key={index} className="calendarMonthTitleYear">
						{part.value}
					</span>
				) : (
					part.value
				),
			)
	);

	return (
		<header className="calendarMonthHeader">
			<h2 className="calendarMonthTitle">
				{titleAction ? (
					<button
						type="button"
						className="calendarMonthTitleButton"
						title={titleAction.label}
						onClick={titleAction.onClick}
					>
						{title}
					</button>
				) : (
					title
				)}
			</h2>
			<div className="calendarMonthControls">
				{/* Kept mounted while collapsed so the buttons fade out instead of popping. */}
				<div className="calendarMonthNav" inert={collapsed}>
					{showToday ? (
						<button type="button" className="calendarTodayButton" onClick={onGoToToday}>
							{t("calendar.today")}
						</button>
					) : null}
					<button
						type="button"
						className="calendarNavButton"
						aria-label={isWeek ? t("calendar.previousWeek") : t("calendar.previousMonth")}
						onClick={() => onStep(-1)}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-sm)" />
					</button>
					<button
						type="button"
						className="calendarNavButton"
						aria-label={isWeek ? t("calendar.nextWeek") : t("calendar.nextMonth")}
						onClick={() => onStep(1)}
					>
						<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-sm)" />
					</button>
				</div>
				{collapsible ? (
					<CollapsibleTrigger
						className="calendarNavButton calendarCollapseButton"
						aria-label={collapseLabel}
						title={collapseLabel}
					>
						<HugeiconsIcon icon={ArrowDown01Icon} size="var(--icon-sm)" />
					</CollapsibleTrigger>
				) : null}
			</div>
		</header>
	);
}
