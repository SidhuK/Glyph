import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { weekStartsOnForLocale } from "../../components/app/calendar/monthGrid";
import { type CalendarWindow, calendarDateRange, calendarWeeks } from "../../lib/database/calendar";

export function useCalendarWindow() {
	const { i18n } = useTranslation("shell");
	const locale = i18n.language;
	const [calendarWindow, setCalendarWindow] = useState<CalendarWindow>(() => ({
		anchor: new Date(),
		mode: "month",
	}));
	const weekStartsOn = weekStartsOnForLocale(locale);
	const weeks = useMemo(
		() => calendarWeeks(calendarWindow, weekStartsOn),
		[calendarWindow, weekStartsOn],
	);
	const dateRange = useMemo(() => calendarDateRange(weeks), [weeks]);
	return { calendarWindow, setCalendarWindow, weeks, dateRange, locale };
}

export type CalendarWindowState = ReturnType<typeof useCalendarWindow>;
