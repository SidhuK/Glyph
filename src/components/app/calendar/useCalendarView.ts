import { format, parseISO } from "date-fns";
import { type MouseEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../../contexts";
import { getTodayDateString } from "../../../lib/dailyNotes";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { type NativeContextMenuItem, showNativeContextMenu } from "../../../lib/nativeContextMenu";
import { type PeriodKind, isPeriodNoteEnabled } from "../../../lib/periodNotes";
import type { SidebarCalendarDayClick, SidebarCalendarLayout } from "../../../lib/settings/model";
import { toast } from "../../../lib/toast";
import type { CalendarTitleAction } from "./CalendarMonth";
import { weekStartsOnForLocale } from "./monthGrid";
import { useCalendarActivity } from "./useCalendarQueries";

export type OpenPeriodNoteAtDate = (kind: PeriodKind, date: string) => Promise<void>;

interface UseCalendarViewOptions {
	layout: SidebarCalendarLayout;
	dayClick: SidebarCalendarDayClick;
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
	/** Week layout only: clicking the title asks the owner to switch to the month. */
	onShowMonth?: () => void;
}

/** Visible range, selection and day actions shared by the sidebar calendar and the Calendar pop-up. */
export function useCalendarView({
	layout,
	dayClick,
	onOpenPeriodNoteAtDate,
	onShowMonth,
}: UseCalendarViewOptions) {
	const { t, i18n } = useTranslation("shell");
	const { dailyNotesFolder, periodNotesEnabled } = useUILayoutContext();
	const [anchor, setAnchor] = useState(() => new Date());
	const [selectedKey, setSelectedKey] = useState(() => getTodayDateString());
	const selectedDate = useMemo(() => parseISO(selectedKey), [selectedKey]);
	// Recomputed each render so the today highlight survives a midnight rollover.
	const today = parseISO(getTodayDateString());
	const quarterlyNotesEnabled = isPeriodNoteEnabled("quarter", periodNotesEnabled);
	const { activityByDate, errorMessage: activityError } = useCalendarActivity(
		anchor,
		layout,
		weekStartsOnForLocale(i18n.language),
	);

	const openPeriodNote = (kind: PeriodKind, date: string) => {
		onOpenPeriodNoteAtDate(kind, date).catch((error: unknown) => {
			toast.error(t("calendar.openFailed"), { description: extractErrorMessage(error) });
		});
	};

	const handleSelect = (date: Date) => {
		const dateKey = format(date, "yyyy-MM-dd");
		const wasSelected = dateKey === selectedKey;
		setSelectedKey(dateKey);
		// Keeps the week strip on the selected day when the layout switches.
		setAnchor(date);
		if (!dailyNotesFolder) return;
		if (dayClick === "open" || wasSelected) openPeriodNote("day", dateKey);
	};

	const goToToday = () => {
		const todayKey = getTodayDateString();
		setAnchor(parseISO(todayKey));
		setSelectedKey(todayKey);
	};

	let titleAction: CalendarTitleAction | null = null;
	if (layout === "week" && onShowMonth) {
		titleAction = { label: t("sidebarCalendar.menu.showMonth"), onClick: onShowMonth };
	} else if (layout === "month" && isPeriodNoteEnabled("month", periodNotesEnabled)) {
		titleAction = {
			label: quarterlyNotesEnabled
				? `${t("calendar.openMonthlyNote")}\n⌥ ${t("calendar.openQuarterlyNote")}`
				: t("calendar.openMonthlyNote"),
			onClick: (event) =>
				openPeriodNote(
					event.altKey && quarterlyNotesEnabled ? "quarter" : "month",
					format(anchor, "yyyy-MM-dd"),
				),
		};
	}

	const handleDayContextMenu = (event: MouseEvent<HTMLButtonElement>, date: Date) => {
		// The sidebar section has its own menu; a day's menu replaces it rather than stacking.
		event.stopPropagation();
		const dateKey = format(date, "yyyy-MM-dd");
		const items: NativeContextMenuItem[] = [
			{
				label: activityByDate.get(dateKey)?.hasDailyNote
					? t("calendar.menu.openDailyNote")
					: t("calendar.menu.createDailyNote"),
				action: () => openPeriodNote("day", dateKey),
			},
		];
		if (isPeriodNoteEnabled("week", periodNotesEnabled)) {
			items.push({
				label: t("calendar.menu.openWeeklyNote"),
				action: () => openPeriodNote("week", dateKey),
			});
		}
		void showNativeContextMenu(event, items).catch((error: unknown) => {
			console.error("Failed to show calendar day context menu", error);
		});
	};

	return {
		locale: i18n.language,
		anchor,
		setAnchor,
		selectedKey,
		selectedDate,
		today,
		activityByDate,
		activityError,
		titleAction,
		openPeriodNote,
		handleSelect,
		goToToday,
		handleDayContextMenu,
	};
}
