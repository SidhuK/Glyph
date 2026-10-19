import { useTranslation } from "react-i18next";
import { CalendarDaySummary } from "./CalendarDaySummary";
import { CalendarMonth } from "./CalendarMonth";
import { type OpenPeriodNoteAtDate, useCalendarView } from "./useCalendarView";
import type { SidebarCalendarDayClick, SidebarCalendarLayout } from "../../../lib/settings/model";

interface CalendarViewProps {
	layout: SidebarCalendarLayout;
	dayClick: SidebarCalendarDayClick;
	showDaySummary: boolean;
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
	onOpenNote: (path: string) => void;
	onShowMonth?: () => void;
	collapse?: { collapsed: boolean; onToggle: () => void };
}

/** The calendar card shown in the sidebar and in the Calendar pop-up. */
export function CalendarView({
	layout,
	dayClick,
	showDaySummary,
	onOpenPeriodNoteAtDate,
	onOpenNote,
	onShowMonth,
	collapse,
}: CalendarViewProps) {
	const { t } = useTranslation("shell");
	const calendar = useCalendarView({ layout, dayClick, onOpenPeriodNoteAtDate, onShowMonth });

	return (
		<div className="calendarCard">
			<CalendarMonth
				layout={layout}
				month={calendar.anchor}
				selected={calendar.selectedDate}
				today={calendar.today}
				activityByDate={calendar.activityByDate}
				locale={calendar.locale}
				titleAction={calendar.titleAction}
				onMonthChange={calendar.setAnchor}
				onSelect={calendar.handleSelect}
				onGoToToday={calendar.goToToday}
				onDayContextMenu={calendar.handleDayContextMenu}
				collapse={collapse}
			/>
			{collapse?.collapsed ? null : calendar.activityError ? (
				<p className="calendarMessage" role="alert">
					{t("calendar.loadFailed", { message: calendar.activityError })}
				</p>
			) : null}
			{showDaySummary && layout === "month" && !collapse?.collapsed ? (
				<CalendarDaySummary
					selectedKey={calendar.selectedKey}
					selectedDate={calendar.selectedDate}
					today={calendar.today}
					locale={calendar.locale}
					hasDailyNoteActivity={
						calendar.activityByDate.get(calendar.selectedKey)?.hasDailyNote === true
					}
					onOpenDailyNote={() => calendar.openPeriodNote("day", calendar.selectedKey)}
					onOpenNote={onOpenNote}
				/>
			) : null}
		</div>
	);
}
